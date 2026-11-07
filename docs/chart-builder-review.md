# Building a chart through the GUI

This change makes blank charts and reusable object designs accessible without first editing the schema. It builds on the explicit text/merge-field behavior in [editor-text-review.md](editor-text-review.md).

## What a user can do

1. Begin a blank chart. **Add object** is on the page and in the toolbar. Enter a name and either choose an existing object type or type a new one. Double-clicking the page and the existing Insert shortcuts still support quick inline creation.
2. Draw and group shapes. Their text panel accepts ordinary text and offers **Merge field → New field…**. Literal braces remain literal; field chips bind to record values.
3. Select the grouping and choose **Save as object type…** in the side panel. Name the type and review its fields and datatypes. Saving creates the type's schema, its standard design in this view, and its first object. One Undo restores the drawing and removes those additions.
4. Add another object of that type. It uses the same design automatically, with its own field values. Edit values in the side panel; edit the shared graphics through **Design → Edit design**.
5. Drag a field's label from the record panel onto a graphical part. Existing words and fields stay in place. **New field…** while editing a design stages a text field; **Done** adds it to the schema with the design. **Discard** adds nothing.

The first instance created from a drawing starts with the type's name and is immediately editable. Designs remain scoped to views, following the existing model. Linked fields such as “Owner's name” keep their meaning; saving a new type does not invent relationships for it. The save dialog identifies these as linked fields. New fields created during an existing design edit are text fields; the new-type save dialog also offers the existing scalar datatypes. No schema or log migration is required.

## Review boundaries

- `app/ui/canvas.js`: object creation reuses the existing placement and transaction path; literal shape editing uses TextTemplate; field drops prefer visible design parts over an overlapping “Other fields” frame.
- `app/ui/designs.js`: drawing-to-type schema declarations and the design are committed together. Only fields explicitly created during an existing design edit are declared on Done. Existing relative tokens must never become own fields merely because the design was edited.
- `app/ui/inspector.js`: ordinary shapes and design parts use the same text controls. The standalone inspector still supports running without the design/canvas modules.
- `app/ui/shell.js`, `formatbar.js`, and `canvas.css`: one empty-canvas prompt, visible creation actions, and toolbar sizing.

The workbook continues to store records, schema specs, and scoped Design notes. There is no second object store or separate canvas document to reconcile. Tests of the existing source syntax, formulas, scope, undo, and exports remain in their existing suites.

## Acceptance checks

Open [builder-test.html](../app/tests/builder-test.html) in Chrome or Edge. It starts with an in-memory sample workbook, then creates blank charts through the gallery. All authoring goes through controls, contenteditable text, keyboard shortcuts, and pointer events. Model APIs are read only in the acceptance script. The fixture replaces workbook storage and native file picking; save/reopen round-trips a serialized workbook. Preferences are isolated in memory too.

The test builds objects and a grouped drawing, creates a type and its schema, checks literal text beside fields, verifies Cancel and reserved names, exercises Undo/Redo, fills individual records, drags a field into a part, saves and discards design edits, draws a relationship, and saves/reopens the result. It also checks that a later object inherits the design.

For visual review, append `?stop=blank`, `?stop=save`, `?stop=cards`, or `?stop=finished`. These stop at the relevant UI and hide the test report after successful checks. These are scripted DOM-event browser tests, not trusted hardware-input automation or a human usability study. The PowerPoint ease-of-use goal still needs a short human task comparison.

Verified in headless Chrome on November 7, 2026: builder 37, canvas 784, inspector 421, scene 358, export 223, core 172, engine 284, table 580, store 76, tour 158, skill 19, text 23, and performance 27 checks passed: **3,162 total**. `git diff --check` passed. The complete builder flow also passed at 1024 × 900 and in dark mode; the blank page, save dialog, and finished chart were inspected in screenshots.

The initial regression pass found an inspector dependency assumption and toolbar overflow. Both were fixed and their suites rerun successfully. A narrow-window acceptance failure came from using SVG bounds that included selection widgets; the drag helper now reads the rendered box geometry for its pointer coordinates. It still performs the drag through pointer events.

## Kinds versus choice fields

Keep kinds for structural differences for this iteration. Use choices for classifications: for example, Person with Role and Department, or Entity with Legal form. Separate kinds for every department or visual appearance would duplicate schema without adding useful meaning.

Kinds currently anchor schema locations, relationship roles, formulas, tables, filters, and scoped notes. A choice is an entry on an object, while a kind identifies the object's root. Removing the root kind is consequently more than a rename of the type picker. A replacement must define which fields and relationship roles apply to an object, how that applicability changes when its choices change, and how existing historical logs retain their meaning.

A useful next experiment is one generic object kind with choice-based classifications and explicit rules for field/relationship applicability. Compare it against a small real chart before migrating records. Preserve object IDs and history, and require save/reopen and cross-view GUI tests. Do not introduce a second “type” choice that merely repeats the existing kind.

For code cleanup, the next extraction should be reusable schema-declaration commands and the shared text editor, followed by scope resolution and note-writing. Keep each extraction behavior-preserving and reviewable independently of a model migration. This change consolidates the inspector's repeated text-editor branches; it does not attempt a broad rewrite of the large canvas and format-bar modules.
