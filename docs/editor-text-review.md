# Explicit text and fields in designs

Making a design used to infer fields from the words on a shape. For example, a shape saying `Fund III` could become `{Name}`, and a label saying `Name` could become a binding. Applying that design to other records then changed words the user had typed. Making a design now retains its source text. Only explicitly inserted fields vary with the associated record.

The design text panel preserves literal braces, repeated spaces and paragraphs. Its Field menu inserts at the saved caret, including after the menu takes focus. Leaving a part commits its pending text before the next part replaces the editor. Dropping a field adds it to existing words and fields, both on a live design and while editing one. Replacing an existing field is still available through its chip's menu.

## Model boundary

The existing model already separates the necessary concerns:

- Records describe objects and relationships.
- A Design note associates graphical parts with a pattern in one view.
- Notes resolve scope and overrides; the narrowest applicable note decides.
- TextTemplate parses literal text and field tokens without knowing any records or UI.
- Scene reads tokens against each associated record and produces the geometry and text consumed by the canvas, PDF and PowerPoint exporters.

This change adds no record type, persistence format version, server, build tool or dependency. Existing unescaped `{Field}` and `{Field|initials}` tokens still work. The design panel encodes literal braces with a backslash, backslashes with another backslash, and a leading equals sign with a backslash; these escapes are decoded in the shared renderer. A historical source string already containing those escape sequences will now be interpreted that way. Record values are substituted once, so braces or backslashes inside a field value remain literal.

The older inline canvas, annotation and table editors still expose the existing source syntax. Unifying their authoring controls with the design panel is a separate follow-up; this change does not claim every text-entry surface has been converted to chips. Existing formula-backed text remains supported.

## Review and verification

Start with `app/core/text.js`, then the changes in `app/ui/designs.js`. The changes in `scene.js` remove duplicated parsing; the small canvas and inspector changes use the same field detection. HTML entry points load the new module before Scene.

Open these files directly in Chrome or Edge; no installation is required:

- `app/tests/text-test.html`: literal round trips, legacy fields, missing fields, escaping, whitespace, one-pass substitution and additive drops.
- `app/tests/scene-test.html`: different records reading one design, literal text remaining identical, and save/reopen, alongside the existing scene checks.
- `app/tests/canvas-test.html?format`: design creation, part editing, field menu placement, drops, scope and undo.
- `app/tests/canvas-test.html`: the broader canvas suite.
- `app/tests/export-test.html`: the shared scene's export behavior.

For a manual check, open the sample, select a box, choose **Edit design**, select a text part and type words around a field. Insert another field midway through the words. Switch parts, return, then choose **Done**. Check the instances in scope, change the underlying record value, and undo. Literal words should remain identical while the fields follow their records.

Verified in headless Chrome on November 7, 2026: text 23, scene 358, canvas 784, inspector 421, export 223 and performance 27 checks passed (1,836 total). The full canvas suite passed in an isolated run; an earlier concurrent run missed its Tidy animation timing assertion. `git diff --check` also passed. These are scripted browser checks, not a claim of a complete manual usability review.

## Continuing the cleanup

The next useful extraction is the text editor itself: one component for the design panel, inline canvas text and annotations, with one field-insertion command and one commit/cancel contract. After that, extract scope resolution and note-writing commands from the canvas and format bar, with tests of selection, group patterns, instance overrides and undo. Keep the record model stable until a concrete failing case requires changing it. Large UI modules can then be split along these boundaries without changing their behavior in the same commit.

Claude's handoff identifies four unfinished branches. They are preserved and have not been merged into this work:

| Branch | Area | Handoff status |
| --- | --- | --- |
| `worktree-agent-a88f44e7aaaf29053` | Chart readability and layout | WIP, not reviewed or tested |
| `worktree-agent-ae3d6330e11d1ba74` | Colors, themes and template files | WIP, not reviewed or tested |
| `worktree-agent-a01f8863cebb8ce2a` | PowerPoint feature list | WIP, not reviewed or tested |
| `worktree-agent-a6981f21d1704c326` | Photos and designs | Multiple feature commits; handoff still calls for review and testing |

The photos/designs branch overlaps `scene.js` and `designs.js`. Review its changes against the explicit-text contract before integrating it, particularly any code that guesses bindings from record values. Treat each branch as a separate review and validation task.
