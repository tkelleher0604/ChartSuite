# Scoped canvas editing

The canvas is a projection of records through reusable graphics. Its editor should expose ordinary drawing and text operations while making their reach explicit. A record's fields need not determine its visual structure: one paragraph can mix arbitrary literal text with several fields, and one record group can contain independently positioned shapes, text, pictures and connectors.

## State and projection

Let `R` be the record graph, `G` a graphical tree, `B` the bindings from graphical groups to records, and `P` the scoped presentation rules. Rendering is `render(R, G, B, P, view, date)`; it does not create a second copy of record data.

A text block is an ordered sequence of literal spans and field bindings. For example:

```
Literal("Contact ")
Field(path = Name)
Literal(" about ")
Field(path = Project)
Literal(".\nPlease reply by ")
Field(path = Due date)
Literal(".")
```

The stored paragraph retains binding identity. The displayed paragraph substitutes each field's current value. A field can therefore change length without moving the identity of later fields or losing formatting. Existing `{Field}` storage syntax remains an adapter for this sequence; it is not the required user interface. Literal braces are escaped by the editor, not interpreted as bindings.

The projection records both source ranges and displayed ranges. Source ranges count literal characters and the complete spelling of each binding. Display ranges count the substituted text. A formatting range touching a binding addresses that complete binding; it must not accidentally style an unrelated occurrence of the same value.

## An editing operation

An operation has three independent inputs:

```
Edit = (selection, scope, intent)
selection = graphical node(s), paragraph range, or record entry
scope = explicit object IDs or a predicate over the record graph
intent = edit text | set value | set appearance | transform | edit structure
```

Resolve scope against the complete record state, including matching records outside the current view. A visible mark is evidence of a target, not the definition of scope membership. Match nested classifications through owned entries; do not traverse relationship endpoints merely to widen membership. When a binding itself follows a relationship, resolve its backing entry separately and deduplicate shared targets.

Capture scope at the start of a gesture. Changing scope finishes the previous gesture at its original scope before the next gesture begins. Inherited formatting never implies permission to change peers. The default is the selected object(s); broader reach is an explicit choice with an affected count.

Opening and leaving a value without input is not a write. Deliberately entering the displayed value again is a set-value operation: at a broader scope, other objects may still need to change. Comparing only with the selected object's old value would incorrectly erase that distinction.

| User action | Write destination |
| --- | --- |
| Type outside a bound span | The paragraph's literal text at the chosen presentation scope |
| Type inside a bound span | The resolved record entry for each object in scope |
| Format selected words or a field | Source-range presentation, retaining binding identity |
| Move or resize a layer within a group | That layer's local geometry at the chosen presentation scope |
| Move a whole record group on the page | Placement of the selected/scoped record instances |
| Add, remove, reorder or group graphic elements | The scoped graphical structure |
| Convert selected literal text through the record panel | A new entry on that record, a prompted schema name, and a binding replacing exactly that selection |

For presentation operations, a node must exist in a target's graphical structure. Report compatible targets rather than claiming that a layer-specific change reaches unrelated designs. Data operations can reach records using different designs because their targets are schema paths, not graphical node IDs.

## Live field editing

Entering a bound span highlights it and identifies the corresponding record-panel field. Its displayed text remains editable. Leaving the span commits one value edit; incomplete numbers and dates can remain drafts while typing. Invalid values retain their draft and a correction message rather than silently closing or partially writing a broad edit.

The panel mirrors the draft, then reads the committed record state. Literal edits continue to affect the paragraph. A single owner controls an active text draft, so switching between the canvas and panel cannot let a stale blur overwrite newer text.

A writable binding resolves to one entry per source object. A computed value, a transformation such as initials, or an aggregate over several related owners does not have an unambiguous inverse. Display it normally and explain its editing restriction; provide the underlying record path rather than guessing a write target.

Bulk value changes validate every target before committing. They preserve the same date, fixed-fact, rule and history behavior as editing in the record panel. All writes from one accepted operation share one transaction and one Undo entry. Fixed facts and changing facts retain their distinct temporal semantics even within the same bulk operation.

When a change awaits date confirmation, the proposal owns its paragraph and schema drafts. Closing an editor does not discard them. Presentation operations retain their view, part and target pattern; a later individual edit cannot replace an earlier shared operation. Reopened editors resolve the proposed notes through the same precedence as committed notes. Other editors can amend or revert a value without dropping the proposal's remaining text or schema changes.

## Layout is an explicit property

Text sizing and group layout are independent. A frame can grow, remain fixed, or explicitly shrink its text. A group can stack text as it grows or preserve free placement. Free placement does not move neighboring layers. Fixed frames report overflow; only explicit shrink mode reduces text size.

Resolved dimensions for a particular record are preview results. Saving a shared design must preserve authored coordinates and sizing intent rather than baking the longest preview's dimensions into every instance. Manual moves/resizes remain authored changes and participate in Undo.

## Implementation boundaries

`EditScope` resolves object membership. `BoundText` projects spans and plans record writes. `App.putBatch` applies them through existing temporal transaction rules. `BoundWords` manages value drafts and caret identity. `WordsEditor` owns paragraph source/ranges and text interaction. `CanvasWords` owns overlay/focus. `CanvasBindings` connects these UI controls to records and scoped design notes. `DesignGeometry` converts preview geometry back to authored coordinates without depending on the workbook or UI; the design session owns persistence and supplies text measurement.

The existing chart layouts, design notes and historical logs are compatibility mechanisms, not restrictions on the interaction model. This document specifies the editing contract; it is not a claim of complete PowerPoint feature parity. The GUI tests and review guide identify which behaviors have been implemented and verified.
