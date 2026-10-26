# The core

Three classic scripts, loaded in this order, each exposing one global: `Tree` (tree.js), `Notes` (notes.js) and `Log` (log.js). They touch no page and no storage. Terms are data-model.md's and dendra.md's. Tests: [../tests/core-test.html](../tests/core-test.html).

## Shapes

**Records**, keyed by id in a state `{ [id]: record }`:
`{ kind }`, `{ at, edge, field, value }`, `{ at, edge, choice }`, `{ at, edge, tag }`, `{ args: [{ edge, at }], field+value | choice | tag }`. A record may carry `since` and `before` (ISO days). Values are canonical: a percentage is a fraction (0.716), a date an ISO day, money a number.

**Trees.** Specifications, patterns and a record's own tree are nested:
- an object node: `{ id, kind }` an object, `{ kind }` a kind, `{}` unlabeled;
- any other node: `{ out, args: [{ edge, loc }] }`, where `out` is `{ field, value }` a value, `{ field }` a datatype, `{ choice }` or `{ tag }`, and is absent where the label is removed.

Edges keep their labels; argument order doesn't matter.

**Notes**: `{ note: id, label, pattern, view?, param?, value }`. `view` is a View object's id. `param` names one of a relation pattern's edges: the Name there is that role's list name (Owners), the Order its place among the edges. Labels: Name, Description, Order, Required, Start, End, Formula, Shown, Caption, Position, and the format properties (Shape, Fill, Outline, Weight, Dash, Font, Size, Bold, Italic, Color, Format). A Formula note's value is its rows, `[{ label, formula }]`; a Position is `{ x, y, w }`.

**Rows and changes.** A row is a version of an item and names the item under its type: `{ id, chart, name }`, `{ id, spec, tree }`, `{ id, record, …record }`, `{ id, note, …note }`, `{ id, shape, … }` (a shape mustn't use those five keys). A change is `{ id, who, when, chart, removes: [row id], adds: [row], reverses? }`. A row is live if added and not removed. The file is `{ "dendra": 1, "changes": [...] }`.

## Tree

- Text: `clean`, `norm` (clean, lower case), `same`.
- Records: `isObject`, `isField`, `isTag`, `isChoice`, `isRelation`, `typeOf` ('object', 'field', 'tag', 'choice'), `argsOf(r)` → `[{ edge, at }]`, `rootLabel(r)`.
- For formulas.js, with today's keys: `specKey(recs, id)`, `parameterization(recs, id)`.
- `treeOf(recs, id)`: a record's tree, or null if a location is missing. Memoized per state, so never change a state in place.
- `index(recs)` → `{ entries, relations, kinds }`, Maps from a record id (or a normalized kind) to ids. `dependents(recs, ids)`: the ids and everything located at them, at any depth. `pathOf(recs, id)`, `objectOf(recs, id)`, `objectName(recs, id)`.
- Patterns: `specOf(t)` (objects to kinds, a value to its datatype), `bare(t)` (root label removed: a parameterization, or a style's pattern), `key(t)`, `paramKey(t)`, `shapeOf(t)` (every label removed), `weight(t)`.
- `narrower(p, q)`: q is obtained from p by replacing objects with kinds, values with datatypes and removing labels (reflexive). `fits(recs, id, p)` is `narrower(treeOf(recs, id), p)`. `idsIn(t)`: the object ids in a tree.
- `rename(t, p, from, to)`: at every node fitting p, an edge, kind or option `from` becomes `to`. `renamed(node or row, from, to)` does one node. `lift(t, p)`: every node fitting p, an entry at an entry, moves to its location's location.
- `schema(trees)` → `{ [key]: spec }`, closed under locations. `schemaError(S)`: a sentence, or null.
- Values: `DATATYPES` (text, number, percent, money, date, document → names), `PHRASES`, `MONTHS`, `parseDate(text)` → ISO or null, `formatDate(iso)`, `classify(text)` → datatype, `parse(datatype, text)` → value or undefined, `format(datatype, value)` → text, `isNumber`, `isAddress`, `documentName`.

## Notes

`Notes.index(noteRows)` returns a reader. `Log` builds one per chart: `wb.notes(chart)`. Each `t` below is a tree: a record's (`Tree.treeOf(state, id)`) or any pattern.

- `resolve(label, t, view?, param?)` → `{ value, note }` or null: the note that decides. `value(…)` → just the value.
- `name(t)`, falling back to the kind, the edge, or a relation's edges joined by ' · '. `listName(t, edge)`. `edges(t)`: a relation's edges in order.
- `description(t)`, `order(t)`, `required(t)`, `isStart(t)`, `isEnd(t)`.
- `shown(t, view)`, `position(t, view)`, `caption(t, view)`, and `formats(t, view)` → `{ [label]: { value, note } }` for every format property a note decides.
- `styles(view)` → `[{ pattern, key, order, outputs: [{ pattern, formats: { [label]: value } }] }]`, in the view's order. An output pattern with no root label applies to every output.
- `definitions(schema)` → formulas.js's input, one per Formula note: `{ id, name, covers, rows, type, datatype?, options?, edges? }`. `covers` holds the parameterization keys of the schema's specifications fitting the note's pattern.
- `relations(schema)` → `[{ name, type, edges, lists: { [from]: { [listed]: name } }, covers }]`, formulas.js's names.
- `fitting(schema, p)`: the specifications fitting p. `notes(label)`: every note with that label.

**The narrowest decides.** Among the notes with a label whose pattern t fits (and whose `param` matches), a note in the view comes before one in no view. Then the pattern with the greater weight wins, and then the lower note id. Notes in other views don't count. Where notes reach one mark through different records, `styles(view)` gives the order, and the later style wins.

**In a view, Order orders its styles** (their stacking). With no view, it orders entries among their location's entries, or a relation's edges (with `param`), or the views (on a View object). A note at one object or one value belongs to that record alone, not to a style.

## Log

`Log.open(json | changes | workbook?)` → a workbook `wb`. `Log.union(a, b)` → a new workbook. `Log.today()`, `Log.newId()`, `Log.validOn(row, day)`.

Reading, per chart:
- `wb.asOf(chart, day = today)`: the chart as of a day, a state. A record holds when its row is valid on the day, the day falls from its start entry and before its end entry (Start and End notes), and its locations hold. Memoized per day.
- `wb.at(moment)`: the log as it stood then, a workbook.
- `wb.schema(chart)`: spec items with every version of every live record, closed. `wb.notes(chart)`: the Notes reader.
- `wb.rows(chart)` (live), `wb.item(chart, id)` (an item's live rows, earliest first), `wb.days(chart)` (the days something starts or ends), `wb.charts()` (live chart rows), `wb.changes()` (all, by time).
- `wb.deleted(chart)` → `[{ item, type, rows, change }]`: items with rows and none live, and the change that removed them.

Changing:
- `wb.edit({ chart, who, day?, when? })` → a transaction. `tx.add(type, payload, id?)` → id. `tx.set(id, payload)` makes a new version. `tx.remove(id)`. `tx.rename(p, from, to)`. `tx.moveUp(p)`. `tx.commit()` → the change, a sentence saying why not, or null if empty.
  - With a `day`: an added record starts on it, setting a record splits its validity there (the old value before, the new from), and removing ends a record and its dependents there.
  - With none ("Today"): setting corrects the version in force, keeping its period, and removing deletes, taking along the item's dependents, the notes at it, and a view's notes and shapes.
  - `rename` and `moveUp` reach every tree narrower than p: records (all versions), specifications and notes' patterns, list names, and Formula rows if formulas.js offers `renameName`.
- `wb.apply(change)`: the change, or why not. Refused if it removes a row that isn't live, or newly breaks the timeline (two records with one argumentation valid on a common day), a location, or the schema's conditions.
- `wb.undo(who, chart)`, `wb.redo(who, chart)`, `wb.reverse(changeId, who)` (Restore), `wb.canReverse(changeId)`, `wb.stacks(who, chart)` → `{ undo, redo }`. A change can be reversed while rows equal to the ones it added are live, so undoing several changes to one record works.
- `wb.merge(other)`: takes in another log's changes (a workbook, JSON or an array). `wb.subscribe(fn)` → unsubscribe; `fn(changes)` runs after each apply or merge.
- `JSON.stringify(wb)` saves; `Log.open(text)` loads.

## The sample

[../sample/calder-ridge.json](../sample/calder-ridge.json) holds one chart, `calder-ridge`, in 119 changes by three authors, from June 2024 on. The views are the View objects `view_main` (Structure), `view_40act`, `view_fund3` and `view_control`. Definitions keep their old ids (`def_tax`, `def_control`…). The 40 Act filter is the tag BDC Affiliate (`def_bdc_affiliate`), shown by its output; the other two filters are Shown notes by kind and Vehicle Type. The feeder's GP change, the Corvane closing, renewed filings and status changes are dated rows. The registered agents once kept as text are deleted, and can be restored.
