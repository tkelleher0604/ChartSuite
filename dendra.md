# Dendra

Dendra is a system of record for the legal team of a private fund manager, or any team that keeps track of entities. It keeps their entities, people and investor groups; the ownership, control, positions and signing authority between them; their registrations, deadlines and documents. It works out by formula what follows from these, draws structure charts from them, and exports the charts to PowerPoint and PDF.

This document is the design. Part 1 continues [data-model.md](data-model.md), whose terms it uses throughout, and builds the rest of the model from them in the same way. Part 2 is the window. Part 3 is the look and the words. Part 4 is what it's built with.

## Part 1. The model

### Time

A **period** is a finite union of spans of days, each "since a, before b", where either end may be absent.

A **dated record** is a record together with a nonempty period, its **validity**. A **timeline** in a schema S is a finite set of dated records of S in which no two distinct records with the same argumentation are valid on a common day, unless both are objects.

A record of a timeline **holds** on a day d if it is valid on d and each of its locations holds on d. The records that hold on d are **the chart as of d**. Sanity check: the chart as of d is a state. It is closed under locations by the definition of holding, and two of its records with one argumentation would both be valid on d.

A kind or relation may name a date entry at it as its **start** and another as its **end** (see Notes): an Entity's are Formation Date and Dissolution Date, a General Partner's Admission Date and Withdrawal Date. A record's validity is then its own period narrowed to the days from its start, if it has one, and before its end. So Formation Date stays an ordinary field, and a fund is in the chart as of a day only once it's formed.

### Change

An **item** is anything in a workbook with an identity: a chart, a specification of its schema (so a kind or an option can exist before any record has it), a record, a note or a free shape. A **row** is a version of an item; a dated record's row carries its validity.

A **change** removes some rows and adds others, and says who made it and when. A **log** is a set of changes in which every row removed was added by a change in the log. A row is **live** if it was added and not removed. **A workbook is its log**: its timeline, notes, views and charts are its live rows.

The **reverse** of a change removes the rows it added and adds fresh copies of the rows it removed; it can be made while every row the change added is live. **Undo** reverses your latest change not yet reversed, and **Redo** your latest undo, if you have made no change since. Reversing an older change is **restoring** it. An item is **deleted** when it has rows in the log and none live.

The **union** of two logs is a log, and taking unions is commutative, associative and idempotent. Saving anywhere is therefore: read the copy there, take the union, write it back. Live rows that break the timeline's condition **disagree**; only changes made without seeing each other can, and a person settles it by keeping one, which is a change.

The log as it stood at a moment keeps only the changes made by then. So a chart can be read two ways, independently: **as of a day** (the world's time) and **as it stood** at a moment (the time it was recorded).

### Notes

A **pattern** is a tree obtained from a record by replacing some of its objects with their kinds, its value (if it has one) with its datatype, and removing the labels of some of its nodes. A record **fits** each pattern obtained from it this way, and a pattern p is **narrower** than q if q can be obtained from p this way. A specification and a parameterization are patterns, and so is every record.

**View** is a kind every chart has, the app's own, never listed among the chart's kinds.

A **note** is an entry located at a pattern, and optionally also at a view, labeled by one of the app's **note labels**:

| Label | What it says of the records that fit |
| --- | --- |
| Name, Description | what a kind, entry or relation is called and means; on a parameter, the name of its list of relatives (Owners, Holdings) |
| Order | where an entry sits among its location's entries |
| Required | that a blank one needs attention |
| Check | that one ruled out needs attention: on a definition, that it checks something |
| Start, End | which entries are the start and end of what they're at |
| Formula | how its records are worked out (see Definitions) |
| Shown, Caption, Position, and the format properties | how a view draws them (see Views): Shape, Fill, Outline, Weight, Dash, Frame, Layer, Arrow, Connector, Above, Font, Size, Bold, Italic, Underline, Color, Align, Format |
| Layout, As Of, Page | on a View object: its layout, the day it keeps, its page (with its Name and Order, the view's own notes) |

**The narrowest decides.** For a record r and a label, of the notes with that label whose pattern r fits, the narrowest decides. In a view, every note at the view decides before any note at no view. Where notes reach one mark through different records, the view's order of its styles decides, the later winning.

Renaming relabels every tree in the chart, records, schema and the patterns of notes alike, so nothing needs re-keying. Moving an entry up a level is one substitution in every tree.

### Definitions

A Formula note is a **definition**. It is a list of **rows**, each a label and a formula, and it covers the records fitting its pattern. `← c` is short for `= IF(c, TRUE)`.

**Nothing.** BLANK is nothing: it drops out of a sum and wipes out a product. SUM, MIN and MAX of nothing are nothing, and COUNT is 0. A definition with nothing to say records nothing.

**Output.** At a candidate a (formulas.md), the output is the entered record's if the timeline has one at a; otherwise what the first row that gives something gives, where for a tag whose rows are all `←`, any row that holds; otherwise nothing is recorded. An entered record is narrower than any formula's pattern, so **entered wins** is the narrowest rule again.

**Loops.** Definitions are worked out in the order in which they read each other. A loop is **monotone** if nothing on it can go down when what it reads goes up: a tag goes up when attested, a number when it grows. AND, OR, ANY, IN, FILTER, a dot, a relation call, SUM, COUNT, MAX, MIN, and `+`, `*`, `>` and `>=` of amounts that aren't negative are monotone; NOT, ISBLANK, `-`, `/`, `<`, `=`, a row giving FALSE, and an IF whose condition is on the loop are not.

**The computed state.** Group by group, the least set of records with these outputs, worked out round by round from nothing until a round changes nothing. A loop that isn't monotone, or whose numbers never settle, shows `#CIRCULAR!`. A computed record's **stage** is the round in which it first appeared.

**Ground.** The ground of an expression where it gives something is: for a record it reads, that record; for AND, a comparison or arithmetic, the grounds of its parts; for IF, those of its condition and the branch taken; for OR and ANY, the ground of one part that holds, of least stage; for FILTER, SUM, COUNT and EACH, each item counted with the ground of its condition or value; for MAX and MIN, the item chosen and every argument that was nothing. A computed record's ground is the label of the row that gave it with that row's ground. Every computed record in a ground comes from an earlier group or round, so unfolding grounds always ends at entered records.

`WITHOUT(x, c)` holds where c holds in the computed state of the timeline without x and its dependents. On a tag r, `r.[label]` is TRUE where a row with that label holds.

The language is formulas.md's, less REACH, LOOKTHROUGH, IMPLIEDBY, IFS, NEXTDATE and ISRULEDOUT, which are definitions of one or two rows now. Look-through ownership, for instance:

```
= Ownership(Investor, Investment).Percentage
  + SUM(EACH(Investor.Holdings, @.Percentage * [Look-Through Ownership](@, Investment)))
```

### Views

A **view** is an object of the kind View. Its notes say how it presents the chart as of its day (today, unless it keeps one): its own (Name, Order, Layout, As Of, Page), and the notes in it. A view is the app's, not a fact about the world, so it's never dated. It has a **layout**: a **chart**, drawn on a page of a size; or a **table** whose rows are the records of one kind, one relation, or every entry of one datatype.

**Marks.** In a chart, a record of the computed state has a **mark**: an object a **box**; a relation with two locations a **line**; any other record a **text**, in the box or on the line of its nearest location that has one. Marks nest as records do. A relation whose Connector is None is a text instead, in the box at its lower end (the side not Above), by role: "Directors: Margaret A. Chen, Priya N. Raman".

**Styles.** A **style** in a view is a pattern p with a map from p's outputs to **formats**: the view's format notes at "p with output o", for each output o. This is the user's definition. A format given at a record sets each property on the nearest mark, up the tree, that has it: Fill given at Entity Type: Limited Partnership fills that entity's box.

**Settings.** A **setting** is a mark and one of its properties. Its value is the first that applies: entered for that one record in this view (narrowest); for a position, the layout's; the styles'; the default (the widest note, in no view). Entered wins, as everywhere.

**Shown** is a property of every mark. A mark is **drawn** when it is shown and the marks it sits in or joins are drawn. A style showing or hiding by output is a view's filter; a condition worth filtering by is a tag of the chart, computed or entered.

**Frames.** A format may draw a frame, a box or a bracket around the boxes it lands on, labeled by its caption: Jurisdiction: Cayman Islands draws "Offshore". Outputs of one style captioned alike share a frame, and a relation's frames the box at its lower end. Frames nest in the order of the styles.

**Free shapes.** A view's page also holds shapes bound to no record: text, a line or arrow, a picture, a frame. A text may be a formula (`="As of " & TEXT(@AsOf, "mmmm d, yyyy")`).

**The legend** is a shape bound to the view's styles. Its rows are, for each style and each output from which a drawn mark takes a format, a swatch drawn in that format and its **caption** (the output, unless a Caption note says otherwise). It is moved, sized, formatted and edited like any shape.

**The layout** works out every position not entered, together: drawn boxes and their sizes, frames as clusters, the lines that rank boxes (a line's Above names the edge drawn on top, as Owner), and the routes of lines. **Tidy** removes a view's entered positions. A box placed among entered ones goes beside its relatives, on no line it isn't on. A redline or a highlight keeps every box where it is, and places what it adds the same way. Boxes in a rank share a height, and triangles of a width and a size of name a size. A box's lines of one relation to every box in a frame land on the frame as one. The layout reads the relations, never their looks, so restyling moves nothing; lines alike along one route are drawn as one. No line runs through a box it doesn't end at, or through a caption: one that would goes around what's drawn. A label goes only where nothing else is drawn, and the layout leaves room for it. Arrow Auto draws an arrowhead where a line doesn't run down from its Above side.

**The page** keeps its size's proportions, a 16:9 slide unless a Page note says otherwise, and grows as a whole to hold what's drawn, so the chart is drawn smaller to fit the slide, by twentieths, so its sizes stay on PowerPoint's half points, and set in the middle of the room under its title. Its title, date and Key are the sheet's own, at the sheet's size (20, 11 and 8 pt), however small the chart is drawn. A size picked is the slide's: as picked where the chart can keep a scale for it, or else as near as the page allows, never shrinking the chart more than holding its scale would.

**The scene** is the drawn marks and free shapes, each setting valued and each text broken into lines. It depends on the computed state and the view and nothing else, and the canvas, PDF and PowerPoint each draw it and nothing else.

### Workbook

A **workbook** is a list of named charts, each with its own schema and timeline, sharing nothing. A **session**, one browser tab, holds the open chart, the view, the selection and the time. It is in no log.

## Part 2. The window

The window has three coordinates, and every screen is a setting of them:
- **the view**: what you are looking at;
- **the selection**: what you are asking about, as keys: a record's id, a free shape's, `legend#row` for a legend's row, `frame:/…` for a frame, `id@box` for a relation's text in one box, and `~pattern` for an entry, relation or kind in general;
- **the time**: today, a day in the world's time, or a moment in the log.

```
┌ ⌥ Calder Ridge Fund III ▾ ────────── Find, or type =   Ctrl K ───────── As of today ▾  Undo Redo  Export ┐
│ Insert ▾ │ Feeder Fund ▾ │ Arial ▾ 10 ▾ B I U A ▾ │ Fill ▾ Outline ▾ Line ▾ │ Align ▾ Order ▾ Group          │
│ ☑ Control  GP III → Halvard   More than 25% ← SUM(FILTER(Controlled.Owners, …)) > 25%                   │
├─────────────────────────────────────────────────────────────────────────┬────────────────────────────────┤
│                                                                         │ the selection                  │
│                     the view: a chart on its page, or a table           │                                │
│                                                                         │                                │
├─────────────────────────────────────────────────────────────────────────┴────────────────────────────────┤
│ Structure │ 40 Act │ Post-closing │ Entities │ Ownership │ Dates │ Documents │ +     2 overdue · 4 blank   │
└──────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

**The title bar** holds the chart menu (the workbook's charts and a new one, the workbooks this browser keeps, files, History, Settings, light and dark, the tour), Find, the date, Undo and Redo, and Export.

**The format bar** shows on a chart. A change applies to the selection, as in PowerPoint; a scope chip says so ("This box", "These 3 boxes"), and its menu offers each group of a style that reaches the selection, named as the Key names it, with its reach ("Funds (6)"). A choice pointed at is previewed on the chart.

**The formula bar** is one row, as Excel's is: the selection's output, its name, and the row that gave it; with nothing selected, the view's name. Its definition's rows drop over the view (the chevron, or Ctrl+Shift+U), headed by why, in a sentence of the facts that fired, each one a link ("… is an owner of the BDC with a voting percentage of 7% (5% or more), so it is an affiliated person (§2(a)(3)(A)), so it is a remote affiliate (§57(e)(1)(A))"); a result ruled out says the condition that held, then, after "but", what failed ("… signs for Fund III with a capacity of Managing Member, but is a member, not a managing member, of GP III, so Capacity Held does not hold"); the rows that hold are in ink and the rest grey. Each name in a row takes a color, and what it means here is outlined on the chart in that color; deeper reasons are the same hue, lighter, down to entered records, even ones the view hides. Hovering part of a formula shows its value here. Clicking a computed line steps down into the clause its parent cited, with a breadcrumb back. The definition is edited here.

**The view.** Views are sheet tabs, dragged to reorder. A chart view is a page of shapes: select, marquee, move, resize, guides, align, order, group, nudge, copy and paste, the format painter, as in PowerPoint. Dragging from a box's edge to another box shows what holds between the two, in sentences, with any other relation they could be in one step away. A table view is a grid edited like Excel, pasting included, that scrolls across under its first column rather than cut a name.

**The inspector** shows whatever is selected:

| Selected | It shows |
| --- | --- |
| nothing | the view: its layout, styles and legend |
| a box or a row | the record: its entries as a tree, then its relatives by list, then its documents; its look and position |
| a line | the relation: its sides, its output, what's at it |
| two boxes | what holds between them, as sentences ("Fund III is an owner of Fund III Blocker"), and Add a relation |
| a column heading, a legend row, an entry's label | that entry or relation in general: its name, meaning, options, required, start and end, styles, and its definition set out as the statute it encodes (each clause's words beside its rows, and what it gives) |

Widened, the inspector is the record's page. Where two people gave one value at once, it shows both answers, each with who gave it; keeping one settles it. History, when open, takes its place.

**Pending changes are redlined** before they are made, as lawyers' comparison software shows them: what would appear in blue, what would go struck through in red. Hovering a tag, typing a value, typing a formula and deleting a row all preview this way; Enter commits, Esc discards.

**Time.** The date control shows the chart as of any day, with a strip of the days on which something starts or ends; with a day shown, typing takes effect from that day. History lists the log, a change and its Undo as one, struck, and shows every view as it stood after a change, with Restore.

**Moving.** Find (Ctrl+K) reaches any record, list, view or action, and `=` works a formula out at the selection. Alt+← and Alt+→ walk the trail of selections. The status bar counts what needs attention (overdue, blank where required, errors), and F8 steps through them.

**Launch.** The dappled wall shows once per opened tab and dims into the page. On the very first launch a tour of five steps follows, each advanced by doing what it teaches: select a box; drag to another; select an italic value; point at a tag; switch views.

## Part 3. The look and the words

**Words.** No subtitles, descriptions, hints or tips. An empty state is a few words and its one action. A tooltip names an icon-only control and its key. A placeholder is "Find" or "New option", never an example or an instruction. A toast is a verb, an object and Undo. Nothing on screen says demo or sample. Teaching belongs to the tour. The model's terms (specification, pattern, note, candidate) never appear.

**Computed** is italic, a computed tag's box is outlined, and a computed line in the default style is dashed: on screen only, like Excel's trace arrows. An entered value a formula also covers keeps a small amber corner. Errors show in place.

**Type.** IBM Plex Sans throughout, formulas included, with their functions in small capitals; four sizes; weights 400, 500, 600. The chart's text is the document's: Arial by default, which PowerPoint and the PDF draw alike.

**Color.** Warm paper and ink, hairlines rather than cards or shadows, and one slate-navy accent for the primary action, the selection and focus. Green attested, red ruled out or overdue, amber needs attention. Dark is tuned on its own; the chart's page stays white.

**The mark** is a tree grown by one rule, each limb ending in two, with its roots the same rule reflected below.

## Part 4. Built with

Every library is vendored at a pinned version, loads as a classic script from a file, and is licensed for commercial use.

| For | Library |
| --- | --- |
| Components and state | Preact, htm, @preact/signals (MIT, Apache-2.0) |
| Drawing and manipulation on the canvas | AntV X6 (MIT) |
| Layout | elkjs (EPL-2.0) |
| Tables | Tabulator (MIT) |
| The formula editor | CodeMirror 5 (MIT) |
| Menus and popovers | Floating UI (MIT), with `<dialog>` and `popover` |
| Keys, and ranking in Find | tinykeys, uFuzzy (MIT) |
| The log in the browser | Dexie (Apache-2.0) |
| Exports | PptxGenJS, jsPDF, svg2pdf.js (MIT) |
| Signing in to Microsoft 365 | MSAL (MIT) |
| Type | IBM Plex (OFL) |

The model, the formula engine, the scene and the trunk router are Dendra's own.
