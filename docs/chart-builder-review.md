# Building a chart through the GUI

This change makes blank charts and reusable object designs accessible without first editing the schema. It builds on the explicit text/merge-field behavior in [editor-text-review.md](editor-text-review.md).

## What a user can do

1. Begin a blank chart. **Add object** is on the page and in the toolbar. Enter a name and either choose an existing object type or type a new one. Double-clicking the page and the existing Insert shortcuts still support quick inline creation.
2. Choose **Design a reusable card** on the blank page or in Insert to begin with a name field, or draw and group shapes freely. Their text panel accepts ordinary text and offers **Merge field → New field…**. Literal braces remain literal; field chips bind to record values.
3. Select the grouping and choose **Save as object type…** in the side panel. Name the type and review its fields and datatypes. Saving creates the type's schema, its standard design in this view, and its first object. One Undo restores the drawing and removes those additions.
4. Add another object of that type. It uses the same design automatically, with its own field values. Edit values in the side panel; edit the shared graphics through **Design → Edit design**.
5. Drag a field's label from the record panel onto a graphical part. Existing words and fields stay in place. **New field…** while editing a design stages a text field; **Done** adds it to the schema with the design. **Discard** adds nothing.

The first instance created from a drawing starts with the type's name and is immediately editable. Designs remain scoped to views, following the existing model. Linked fields such as “Owner's name” keep their meaning; saving a new type does not invent relationships for it. The save dialog identifies these as linked fields. New fields created during an existing design edit are text fields; the new-type save dialog also offers the existing scalar datatypes. No schema or log migration is required.

## Review boundaries

- `app/ui/canvas.js`: object creation reuses the existing placement and transaction path; literal shape editing uses TextTemplate; field drops prefer visible design parts over an overlapping “Other fields” frame.
- `app/core/design-schema.js`: pure planning for affected types, field inference and validated declarations. A shared design reaches every note that uses it, including other views and types with no visible instance. Field types are inferred from the full source path and type; unrelated choice options are never pooled. Declaration conflicts return no partial plan.
- `app/ui/designs.js`: commits schema declarations and the design together. Only fields explicitly created during an existing design edit are declared on Done. Existing relative tokens must never become own fields merely because the design was edited. Validation happens before closing the editable draft.
- `app/ui/words.js`: shared literal text, field chips, caret handling and rich-text edits. Adapters provide fields and persistence; the control does not look up records or write transactions.
- `app/ui/inspector.js`: ordinary shapes and design parts use the same text controls. The standalone inspector still supports running without the design/canvas modules.
- `app/ui/shell.js`, `formatbar.js`, and `canvas.css`: one empty-canvas prompt, visible creation actions, and toolbar sizing.

The workbook continues to store records, schema specs, and scoped Design notes. There is no second object store or separate canvas document to reconcile. Tests of the existing source syntax, formulas, scope, undo, and exports remain in their existing suites.

## Acceptance checks

Open [builder-test.html](../app/tests/builder-test.html) in Chrome or Edge. It starts with an in-memory sample workbook, then creates blank charts through the gallery. All authoring goes through controls, contenteditable text, keyboard shortcuts, and pointer events. Model APIs are read only in the acceptance script. The fixture replaces workbook storage and native file picking; save/reopen round-trips a serialized workbook. Preferences are isolated in memory too.

The test builds objects and a grouped drawing, creates a type and its schema, checks literal text beside fields, verifies Cancel and reserved names, exercises Undo/Redo, fills individual records, drags a field into a part, saves and discards design edits, draws a relationship, and saves/reopens the result. It also checks that a later object inherits the design.

For visual review, append `?stop=blank`, `?stop=save`, `?stop=cards`, or `?stop=finished`. These stop at the relevant UI and hide the test report after successful checks. These are scripted DOM-event browser tests, not trusted hardware-input automation or a human usability study. The PowerPoint ease-of-use goal still needs a short human task comparison.

Baseline verification at `c33d90d` on November 7, 2026: builder 37, canvas 784, inspector 421, scene 358, export 223, core 172, engine 284, table 580, store 76, tour 158, skill 19, text 23, and performance 27 checks passed: **3,162 total**. The complete builder flow also passed at 1024 × 900 and in dark mode; the blank page, save dialog, and finished chart were inspected in screenshots. The current runner additionally includes the design-schema suite and both formula-editor suites; use its results for the current checkout.

Latest verification at `508c44a`, November 7, 2026: **3,561 passed, zero failed across 17 suites**, combining the sequential regression run with targeted reruns after the final fixes. [Machine-readable results](review-evidence/verification.json) list each suite. The builder's 87 checks include native browser delete/Undo/Redo, formatting after blur, subsequent edits, and chart Undo/Redo. The storage suite's 88 checks include a delayed two-tab rename; temporarily removing its guard produces exactly the two expected persistence failures.

The complete 87-check builder flow also passes at 1024 × 900 and in dark mode, adding 174 successful assertions beyond the primary suite total.

The initial combined run found that the runner's load gate blocked the performance fixture's load-event checks. The corrected runner captures that synchronous report without a gate; all 27 performance checks passed on rerun. The separate canvas-entry mode adds 30 checks beyond the main canvas suite. These results retain unaffected suites from the combined run rather than treating the harness timeout as a product failure or a passing suite.

The initial regression pass found an inspector dependency assumption and toolbar overflow. Both were fixed and their suites rerun successfully. A narrow-window acceptance failure came from using SVG bounds that included selection widgets; the drag helper now reads the rendered box geometry for its pointer coordinates. It still performs the drag through pointer events.

## Independent GUI exercises

On November 7, three source-blind testers received task briefs and used rendered controls without reading product source, documentation, existing tests, or model APIs. One tester also tried a second task after learning the app. Their work used isolated persistent browser profiles and scripted mouse, keyboard, selection and input events. Reloads checked saved results. These are agent usability exercises, not a controlled comparison with human PowerPoint users.

| Task | Result | Review artifact |
| --- | --- | --- |
| Org chart | Created Maya and four reports, titles and departments; changed Sam from Engineering to Product; applied department colors; downloaded PowerPoint. | [Native PowerPoint render](review-evidence/org-powerpoint.png), [editable deck](review-evidence/org-chart.pptx) |
| Family tree | Created six people, two marriages, shared-parent relationships and birth dates; corrected Avery's name; changed styling and orientation; exercised Undo; downloaded PDF. | [Family tree](review-evidence/family-tree.png), [PDF](review-evidence/family-tree.pdf) |
| Rooms, first attempt | Created fields and a shared Room design through the record editor. Cedar stayed at 12 while Maple changed from 6 to 8. The drawing-to-type shortcut was not discovered. | Led to the explicit blank-page card action. |
| Rooms, fresh tester | Found the card action, inserted Name and Capacity merge fields beside literal text, saved a numeric Capacity schema and shared Room design, created Cedar and Maple, used Building choices, and verified independent values after reload. | [Add object dialog](review-evidence/blank-chart.png), [card editor](review-evidence/card-editor.png), [room cards](review-evidence/room-cards.png) |

The org deck was also opened in installed native PowerPoint. Its thirteen text boxes remain editable inside normal groups. A name was changed in a temporary copy, saved, and read back successfully; the linked original is unchanged. The PDF's content stream contains all six names and dates. The browser export suite separately checks generated file structure and rendering inputs.

The exercises prompted these fixes: a direct card-design action; an explanation that saving creates the first object; preservation of a drawing's silhouette without an added rectangular outline; correct field-eye state for mixed merge text; one Spouses column covering both directions; correct spouse labels with compatibility for old tokens; and one active row when creating a new choice field, with comma guidance. The room screenshot predates the automatic outline fix and shows the tester's successful manual correction; the builder regression now verifies that correction is unnecessary.

The tests also exposed a real persistence gap during workbook creation. Workbook metadata and initial changes now commit in one IndexedDB transaction. A simulated failed write verifies rollback, complete in-memory data, an honest storage status, and recovery of the whole log on a later successful write. Renaming while storage is failing cannot publish an empty workbook entry. Browser startup and animation captures can race virtual time, so the checked-in runner waits for actual completed reports using real time. Apparent page-orientation and legend overlaps that could not be reproduced after reload are not counted as product defects.

## Human review handoff

Run the command in [README](../README.md), then try the blank-page card task with actual mouse and keyboard input. The runner includes the separately selected canvas-entry checks and both formula-editor modes; the main canvas suite includes its formatting, template and craft sub-suites. Inspect the final screenshots as well as the result counts.

Review the changes in this order: literal/field contract; pure design-schema planning; workbook persistence; shared text control and rendering ranges; then the GUI fixes and their acceptance cases. No schema migration, second canvas document, new dependency or build step was introduced. The unfinished Claude branches listed in [editor-text-review.md](editor-text-review.md) remain a separate review queue.

Remaining usability questions for humans are the distinction between selecting a design part and its enclosing object, how clearly formatting scope is separated from editing one record's data, and whether the complete task is faster than PowerPoint. Custom fixed graphics can still need manual room when extra fields are displayed. Local GUI, persistence and exports were exercised; live Microsoft tenant integration is not established by the mocked remote-store tests.

## Kinds versus choice fields

Keep kinds for structural differences for this iteration. Use choices for classifications: for example, Person with Role and Department, or Entity with Legal form. Separate kinds for every department or visual appearance would duplicate schema without adding useful meaning.

Kinds currently anchor schema locations, relationship roles, formulas, tables, filters, and scoped notes. A choice is an entry on an object, while a kind identifies the object's root. Removing the root kind is consequently more than a rename of the type picker. A replacement must define which fields and relationship roles apply to an object, how that applicability changes when its choices change, and how existing historical logs retain their meaning.

A useful next experiment is one generic object kind with choice-based classifications and explicit rules for field/relationship applicability. Compare it against a small real chart before migrating records. Preserve object IDs and history, and require save/reopen and cross-view GUI tests. Do not introduce a second “type” choice that merely repeats the existing kind.

Schema planning and the shared text editor now have separate modules. The next useful boundaries are scope resolution/note-writing and the design edit session's validation/commit/teardown lifecycle. Keep those changes reviewable independently of a model migration. The large canvas and format-bar modules still contain several responsibilities.
