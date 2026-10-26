# The core

Classic scripts, each exposing one global and touching no page: `Tree` (tree.js), `Notes` (notes.js), `Log` (log.js) and `Formulas` (formulas.js), loaded in that order; then `Layout` and `Scene`, `SharePoint` and `Store`, which say what they do in their own headers. Terms are data-model.md's and dendra.md's. Tests: [../tests/core-test.html](../tests/core-test.html) and [../tests/engine-test.html](../tests/engine-test.html).

## Shapes

**Records**, keyed by id in a state `{ [id]: record }`:
`{ kind }`, `{ at, edge, field, value }`, `{ at, edge, choice }`, `{ at, edge, tag }`, `{ args: [{ edge, at }], field+value | choice | tag }`. A record may carry `since` and `before` (ISO days). Values are canonical: a percentage is a fraction (0.716), a date an ISO day, a day of the year (a fiscal year end, datatype `yearly`) ISO's --12-31, money a number, a document its address.

**Trees.** Specifications, patterns and a record's own tree are nested:
- an object node: `{ id, kind }` an object, `{ kind }` a kind, `{}` unlabeled;
- any other node: `{ out, args: [{ edge, loc }] }`, where `out` is `{ field, value }` a value, `{ field }` a datatype, `{ choice }` or `{ tag }`, and is absent where the label is removed.

Edges keep their labels; argument order doesn't matter.

**Notes**: `{ note: id, label, pattern, view?, param?, value }`. `view` is a View object's id. `param` names one of a relation pattern's edges: the Name there is that role's list name (Owners), the Order its place among the edges. Labels: Name, Description, Order, Required, Start, End, Formula, Shown, Caption, Position, the format properties (Shape, Fill, Outline, Weight, Dash, Frame, Layer, Arrow, Connector, Above, Font, Size, Bold, Italic, Underline, Color, Align, Format: `Notes.FORMATS`), and a view's own, at its View object: Layout (`{ rows }` for a table, its rows a kind `{ kind }`, a relation's edges, or a datatype; none for a chart), As Of (the day it keeps) and Page. A Formula note's value is its rows, `[{ label, formula }]`; a Position is `{ x, y, w }`, with `loose: true` where it was only a first place (a box added by a double-click) that gives way to the layout once a line relates it.

**Rows and changes.** A row is a version of an item and names the item under its type: `{ id, chart, name }`, `{ id, spec, tree }`, `{ id, record, …record }`, `{ id, note, …note }`, `{ id, shape, … }` (a shape mustn't use those five keys). A change is `{ id, who, when, chart, removes: [row id], adds: [row], reverses? }`. A row is live if added and not removed. The file is `{ "dendra": 1, "changes": [...] }`.

## Tree

- Text: `clean`, `norm` (clean, lower case), `same`, `plural`.
- Records: `isObject`, `isField`, `isTag`, `isChoice`, `isRelation`, `isView` (an object of the app's own kind, View), `typeOf` ('object', 'field', 'tag', 'choice'), `argsOf(r)` → `[{ edge, at }]`, `rootLabel(r)`.
- `treeOf(recs, id)`: a record's tree, or null if a location is missing. Memoized per state, so never change a state in place. `parameterization(recs, id)`: its parameterization's key, as formulas.js keys what a definition covers.
- `index(recs)` → `{ entries, relations, kinds }`, Maps from a record id (or a normalized kind) to ids. `dependents(recs, ids)`: the ids and everything located at them, at any depth. `pathOf(recs, id)`, `objectOf(recs, id)`, `entryAt(recs, id, edge)`.
- Patterns: `specOf(t)`, `bare(t)` (root label removed), `key(t)`, `paramKey(t)`, `shapeOf(t)`, `weight(t)`, `narrower(p, q)`, `fits(recs, id, p)`, `idsIn(t)`, `rename(t, p, from, to)`, `renamed(node or row, from, to)`, `lift(t, p)`.
- `schema(trees)` → `{ [key]: spec }`, closed under locations. `schemaError(S)`: a sentence, or null.
- Values: `DATATYPES`, `PHRASES`, `MONTHS`, `parseDate(text)` → ISO or null, `parseYearly(text)` → --MM-DD or null (December 31, 12/31, or a date's month and day), `formatDate(iso, 'long' | 'short' | 'month')` (February 14, 2023; Feb 14, 2023; February 2023; a day of the year without its year), `isoOf(date)` (the day a moment falls on, here), `classify(text)`, `parse(datatype, text)` → value or undefined, `format(datatype, value)` → text (a percentage to four places), `outputText(r)` (a record's output: its value, its option, a tag Yes or No), `isNumber`, `isAddress`.
- `linkOf(address)` → `{ link, system, kind, name, id, short, host, site, library, folder, sharing }`: what a document's address points at (SharePoint, OneDrive, EDGAR, NetDocuments, iManage, a file share or the web). A document reads as its `short`.

## Notes

`Notes.index(noteRows)` returns a reader. `Log` builds one per chart: `wb.notes(chart)`. Each `t` below is a tree: a record's (`Tree.treeOf(state, id)`) or any pattern.

- `resolve(label, t, view?, param?)` → `{ value, note }` or null: the note that decides. `value(…)` → just the value.
- `name(t)`, falling back to the kind, the edge, or a relation's edges joined by ' · '. `listName(t, edge)`. `edges(t)`: a relation's edges in order.
- `description(t)`, `order(t)`, `required(t)`, `isStart(t)`, `isEnd(t)`.
- `shown(t, view)`, `position(t, view)`, `caption(t, view)`, and `formats(t, view)` → `{ [label]: { value, note } }` for every format property a note decides.
- `styles(view)` → `[{ pattern, key, order, outputs: [{ pattern, formats: { [label]: value } }] }]`, in the view's order. An output pattern with no root label applies to every output.
- `definitions(schema)` → formulas.js's input, one per Formula note: `{ id, name, covers, rows, type, datatype?, options?, edges? }`. `relations(schema)` → `[{ name, type, edges, lists: { [from]: { [listed]: name } }, covers }]`.
- `fitting(schema, p)`: the specifications fitting p. `notes(label)`: every note with that label.
- **The chart's words**, for a record in a state `recs`: `nameOf(recs, id)` (an object by its Name entry, a view by its Name note, an unnamed object as its kind; a relation by its name; an entry by its label), `shortOf` (Short Name where room is short), `sides(recs, id)` (a relation's arguments in its edges' order), `segmentOf` (a step on a path: Fund III, Jurisdiction: Delaware, Not Good Standing, Cayman GP → Offshore Feeder) and `placeOf` (the path to a record, step by step: Fund III › Jurisdiction: Delaware).

**The narrowest decides.** Among the notes with a label whose pattern t fits (and whose `param` matches), every note in the view comes before any in no view. Then the pattern with the greater weight wins, and then the lower note id. Notes in other views don't count. Where notes reach one mark through different records, `styles(view)` gives the order, and the later style wins.

**In a view, Order orders its styles** (their stacking). With no view, it orders entries among their location's entries, or a relation's edges (with `param`), or the views (on a View object). A note at one object or one value belongs to that record alone, not to a style.

## Log

`Log.open(json | changes | workbook?)` → a workbook `wb`. `Log.today()`, `Log.newId()`, `Log.validOn(row, day)`, `Log.typeOf(row)` (its item's type), `Log.latest(rows)` (the version with the latest start).

Reading, per chart:
- `wb.asOf(chart, day = today)`: the chart as of a day, a state. A record holds when its row is valid on the day, the day falls from its start entry and before its end entry (Start and End notes), and its locations hold. Memoized per day.
- `wb.at(moment)`: the log as it stood then, a workbook.
- `wb.schema(chart)`: spec items with every version of every live record, closed. `wb.notes(chart)`: the Notes reader.
- `wb.rows(chart)` (live), `wb.item(chart, id)` (an item's live rows, earliest first), `wb.charts()` (live chart rows), `wb.changes()` (all, by time).
- `wb.deleted(chart)` → `[{ item, type, rows, change }]`: items with rows and none live, and the change that removed them.
- `wb.disagreements(chart)` → `[{ rows: [{ row, who, when, change }] }]`: live rows that disagree, versions of one item that differ and are valid on a common day, or records of two items with one argumentation; each group earliest first.

Changing:
- `wb.edit({ chart, who, day?, when? })` → a transaction. `tx.add(type, payload, id?)` → id. `tx.set(id, payload)` makes a new version; `tx.update(id, changes)` makes one from the version in force, changed. `tx.remove(id)`. `tx.note(label, pattern, value, { view, param })` sets the note at exactly that pattern, or removes it when `value` is undefined. `tx.keep(rowId)` settles a disagreement: the rows that disagree with it go. `tx.rename(p, from, to)`. `tx.moveUp(p)`. `tx.commit()` → the change, a sentence saying why not, or null if empty.
  - With a `day`: an added record starts on it, setting a record splits its validity there (the old value before, the new from), and removing ends a record and its dependents there.
  - With none ("Today"): setting corrects the version in force, keeping its period, and removing deletes, taking along the item's dependents, the notes at it, and a view's notes and shapes.
  - `rename` reaches every tree narrower than p: records (all versions), specifications, notes' patterns, list names and a table's rows. Wherever a name changes (a label, a kind, an option, or a Name note's value: a relation's name or a list's), every Formula row citing it is renamed too, where formulas.js offers `renameName`. `moveUp` reaches the same trees.
- `wb.apply(change)`: the change, or why not. Refused if it removes a row that isn't live, or newly breaks the timeline (two records with one argumentation valid on a common day), a location, or the schema's conditions.
- `wb.reverse(changeId, who)`, the reverse of a change, and `wb.canReverse(changeId)`: what Undo and Redo, which a window keeps for itself, and Restore make. A change can be reversed while rows equal to the ones it added are live, so reversing several changes to one record in turn works.
- `wb.merge(other)`: takes in another log's changes (a workbook, JSON or an array): the union. `wb.subscribe(fn)` → unsubscribe; `fn(changes)` runs after each apply or merge.
- `JSON.stringify(wb)` saves; `Log.open(text)` loads.

## Formulas

Records worked out from other records, as formulas.md describes. It takes the entered records as of a day, a state, and from the chart's Notes reader `definitions(schema)` and the names `{ relations: relations(schema), schema }`. A name the schema has, on any day, is nothing where no record has it; only a name it never has is `#NAME?`. A row's formula starts with `=` (gives a value) or `←` (`<-` as typed), short for `= IF(c, TRUE)`.

- `computeState(entered, definitions, names, from?)` → R. It starts from `from`, an earlier R (or else the closest of the latest), and works out again only the groups of definitions that the change since reaches; the rest come back as they were left, so R is always what a working-out from nothing gives; `null` starts from nothing. R has `records` (entered and computed; a computed one has `computed`, its definition's id, and an id from its argumentation, `computedId`, stable across workings-out); `computed` `{ [id]: { def, row, label, holds, stage } }`; `covered` `{ [entered id]: { def, row, label, holds, value, agrees } }` (what the rows give where an entry stands, which wins); `errors` `[{ def, id, args, at?, error: { code, msg } }]`, each where its record would be (an entry's `args` its one, `[{ edge, at }]`, beside its `at`), and `#N/A` "Needs Fiscal Year End." where a value the row wanted was blank; and `defErrors`; `loops` `{ [def]: [{ row, from, to, monotone }] }`; `uses` `{ [def]: [def] }` (what each definition reads); `rows`, `order`, `steps`, `ms`, and `state`, the engine's own.
- `ground(R, id)` → why a record is there, as records: `{ id, def, entered, stage, rows: [{ row, label, stage, parts: [{ id, from, to, items? }] }] }`; `rows[0]` is the ground. `groundText(R, id)`: the ground on one line, for exports.
- `evaluateRow(R, def, row, at)` → `{ value, names: [{ from, to, ids }], parts: [{ from, to, values }] }`: a row (its index, or a formula as typed) worked out at a record, or at `{ [edge]: object id }` for a pair that has none. `evaluateAt(R, text, at, names?)` works an expression out at a record (or none), with `names` given values (`{ '@AsOf': date }`). `text(R, value)`: a value as `&` reads it.
- `diff(before, after)` → `{ appear, go, change }`. `check(text, { computed, def })` → `{ kind, problems }`. `suggest(text, cursor, { computed, def, at })` → `{ from, to, list }`.
- `tokenize(text)`, `splitFormula(text)`, `tidyArrow(text)`, `renameName(text, from, to)`, `nameText(name)` (bracketed where it isn't one plain word), `KEYWORDS`, `FUNCTION_NAMES`, `isError(v)`. Spans are character offsets into the row's formula, prefix included.

## The sample

[../sample/calder-ridge.js](../sample/calder-ridge.js) holds one chart, `calder-ridge`, in 144 changes by three authors, from June 2024 to Friday, October 23, 2026. Its views are the View objects `view_main` (Structure), `view_40act`, `view_fund3` and `view_control`, drawn as charts, and four laid out as tables by their Layout notes: Entities, Ownership, Dates and Documents. Definitions keep their old ids (`def_tax`, `def_control`…). The 40 Act filter is the tag BDC Affiliate (`def_bdc_affiliate`), shown by its output; the other two filters are Shown notes by kind and Vehicle Type. The feeder's GP change, the Corvane closing, renewed filings and status changes are dated rows. The registered agents once kept as text are deleted, and can be restored.
