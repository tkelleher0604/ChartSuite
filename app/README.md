# The app

Rboreal's app. Open any page directly in a browser; it needs no build step or server.

## Pages

Open these directly in a browser. The chart and the record panel share their code and their saved state, so a change made on one page shows up on the other.

Both pages work on a workbook of charts. The menu naming the current chart, in the top bar, switches to another chart, starts a new one (blank, or a copy of this one), renames or deletes this one, and restores a deleted one. Charts don't share records, definitions or views, and each keeps its own undo history. "Copy definitions from" in the same menu brings another chart's definitions and relation names into this one, with the specifications they need, unsynced from then on. A new blank chart starts from the record panel's Entities or Individuals, or from a double-click on the chart.

- [chart.html](chart.html): the chart, with a ribbon above it and the record panel on the right.
  - Every object is a box, and every two-argument relation is a line from its first argument to its second.
  - A line's label is the relation's own text (a tag's relation name, like General Partner, or a field's or choice's output), if its style gives one, followed by whatever is located at the relation that its own style shows. Ownership is a tag (Owner, Owned) with a Percentage located at it, so its lines carry no label of their own and the Percentage labels them, just above the box a line reaches. Clicking that text selects the line and engages the Percentage's style.
  - **Styles.**
    - A style belongs to a form, and maps the form's outputs to formatting: shape, fill, outline, font, and whether it's drawn (as a line of text in its box, or, for a relation, as a line).
    - A form is what entries or relations like one another share: the same kind of output (tag, choice or field), the same labels on their edges, and locations of the same shape, whatever kinds and options those locations sit under. So one style covers a Jurisdiction on every kind of entity, and an Ownership whoever the owner is. Each view has at most one style per form, and the gallery and the panel name a style by its form.
    - Every object has the same form, whose outputs are the kinds, so the Kind style gives each kind its box, and says whether boxes of that kind are drawn.
    - A new kind gets the preset: a plain rectangle and a bold Name.
    - Later styles in the list override earlier ones.
  - **The engaged style.**
    - One style is always engaged, and the ribbon's formatting controls edit it. A change therefore applies everywhere the style's entry for that output applies, never to a single box. A scope menu picks the output, or every output.
    - The engaged style is outlined in the ribbon's gallery and highlighted in the panel, on its row or on the kind under the object's name. Its text is ringed on the chart.
    - Controls showing a value that comes from another style are muted. A dot marks a value that a later style overrides on the selected box.
    - The ribbon's first checkbox says whether the engaged style draws its output: Show boxes for the Kind style, Draw line for a relation's, Show text for an entry's.
  - Clicking a box selects it and opens its object in the panel. Clicking a line of text in a box engages that text's style. Clicking a line opens its relation.
  - **Editing a name in place.** Double-click a name, press F2, or just start typing over a selected box. The panel follows as you type. Enter saves and Esc cancels.
  - **Moving and deleting.** Drag a box to move it, or nudge it with the arrow keys.
    - Delete, on a selected box or line, asks whether to delete it from the chart (with everything that depends on it, in every view) or only hide it in this view. Deleted records can be restored from the record panel's Deleted list.
    - A line a formula works out can't be deleted, since the formula would put it back. Delete offers to hide it in this view, or, for a tag, to rule it out, which is entered and overrides the formula there (see [formulas.md](../formulas.md)).
  - **Views.** Tabs along the bottom, like a workbook's sheet tabs, switch between the chart's views. Views share the records and formulas, and each has its own styles, box positions and hidden things.
    - "+" adds a view that starts as a copy of the current one. Double-click a tab to rename it, drag tabs to reorder them, and use the current tab's menu (or right-click a tab) to rename, duplicate or delete a view. The last view can't be deleted.
    - Switching keeps the selection, unless the new view hides it.
    - The sample has two views: Structure, which hides the feeder's General Partner line, and 40 Act, which hides ownership and draws the BDC's close affiliates (blue) and remote affiliates (dashed orange).
  - **Show and hide**, in the View tab, act on the current view only.
    - The Show menu lists what the view can draw, by form, each with a checkbox: Boxes, one per kind; Lines, the entered relations by name; Computed lines; and Text, the entries a box can show. Turning one on or off sets whether its style draws it in this view, so a relation goes for every kind it relates. Text a line shows, like an ownership's Percentage, comes and goes with the line. A computed relation starts out dashed, in a color of its own.
    - Hide hides the selected box or line in this view, and the Hidden menu shows them again.
    - Filter boxes holds a condition, worked out at each object like an entry's formula, that says which boxes the view shows; lines to hidden boxes go with them. The 40 Act view's shows the BDC and its close and remote affiliates. The menu checks the condition as it's typed and says how many boxes it would show. A box where the condition runs into an error stays shown, with a red mark.
    - Tidy layout, offered when a view hides boxes, lays out the ones it shows in rows along ownership and control, in this view only.
    - A computed relation is drawn only where a style shows it. Adding a new relation draws it in the current view and leaves it hidden in the others.
  - **Formulas tab.** Definitions opens the panel's Schema view on its computed forms. New definition starts one, of an entry or of a relation (a relation starts from the selected box, or the two being related). Why? opens the selected computed line, or line of text, in the panel. Calculation says how many computed records the definitions gave, how long it took, and how many errors there are.
  - **Export tab.** PDF saves the current view as a vector PDF fitted to the page size picked beside it (Letter, A4 or Tabloid), under a title and above a footer that names the chart and view and says when it was made. PowerPoint saves a deck of a title slide and the view as editable shapes: boxes with their text in them, lines as single paths, labels as text boxes, in the chart's colors and dashes. All views gives every view a slide. SVG saves the view as a picture. Profile, with a box selected, saves a PDF of its entries and its relations by name, computed values in italics. Everything is made in the browser.
  - Text a formula works out is set in italics on the chart. Lines that would pass behind other boxes go under them and come up into the box they reach.
  - A box with a required entry left blank has a red asterisk at its corner.
  - **Creating boxes.** Double-click the sheet to add a box of any kind there, or of a new kind. The Insert tab does the same at the middle of the view.
  - **Relating two boxes.** Drag from a box's edge handle to another box.
    - A moving dashed line joins the two boxes. The rest of the chart fades and takes no input until Done or Esc.
    - The panel is headed by the two sides. Its rows list every relation in the schema that the two are inputs to, grouped under the relation's name, with one row per way of placing them among its parameters and the role each side takes in it. Sections divide them: Relations they can be in, Computed, and Needs something first.
    - A recorded relation shows its output. An unrecorded one offers a checkbox, a value box or an option menu to record it.
    - Some parameters sit below an object, such as an LLC's Entity Type. Those are filled through that record, and if the object lacks it, the row says what's missing, unless the same relation already takes the two in those roles some other way.
    - Relations with more than two parameters get pickers for the rest.
    - A new relation can be started at the bottom, with a role for each side and where each side's end sits.
  - **Adding styles.** Use Add › Style… in the panel or New style in the ribbon to style the chart by another entry.
  - Ctrl+wheel or the zoom buttons zoom. The panel's left edge drags to resize it.
  - Reset sample, in the top bar, puts the sample chart back as it started, with its views and formulas. Undo brings the changes back.
- [record-panel.html](record-panel.html): the record panel on its own, with adding, editing, deleting and reordering entries, and relations.
  - Adding starts with a name box whose list offers the labels already used at matching locations, plus Create.
  - A tag is added as soon as it's named. Its name sits in the label column and its output, a checkbox, in the value column: green when attested, red and crossed out when ruled out. Hovering previews the other state, and a click switches to it.
  - A choice moves on to an option box listing the outputs of its parameterization, and afterwards shows its option with a dropdown chevron.
  - A field moves on to a value box that detects the datatype: text, number, percent, money or date. A value is kept as what it is (a percentage as a fraction, money as a number, a date as a calendar date) and shown in its datatype's format. A bare number typed into a percent field means that many percent.
  - Entries can be dragged by their handles (or moved with Alt+Up and Alt+Down) among their siblings, with Name kept first. The order is shared by every location with the same specification.
  - An entry can move up a level, from its location to that location's own location, from its edit form or with Alt+Left on its handle. What depends on it moves with it.
  - **Required entries.**
    - An entry's edit form, or its row in the Schema view, can make it required at every location like this one.
    - Wherever a required entry is blank, it shows as a row with an asterisk that can be filled in where it stands. A collapsed row with something blank below it shows an asterisk too.
    - Leaving an object with something required still blank asks first. Moving between that object's own records doesn't count as leaving.
  - **Deleting.** Deleting hides rather than destroys. The record goes to Deleted, at the end of the All list, along with everything that depends on it, and can be restored from there. If others depend on it, the panel asks first.
  - **The schema.** The chart keeps its schema, every specification it has, alongside its records. A new record adds its specification. A specification stays when the last record that has it is deleted, so a restored or new record finds it as it was.
    - What's kept for a specification follows it: entry order by location, required flags and definitions by parameterization, names and styles by form.
    - When an edit made one record at a time leaves a specification that nothing has any more (renaming an entry here only, when it's the only one, or moving it up a level), the specification moves with the record, and what's kept for it follows. Renaming every one renames the specification itself.
    - Each change is checked against the state conditions on the records and the schema conditions on the schema, as [data-model.md](../data-model.md) sets them out, matching labels and options without regard to case. Where an unused specification would clash with a record, the record wins and the specification goes.
    - **The Schema view** (All › Schema) is the chart's vocabulary: a row for each form, kinds first, then entries and relations, each with a badge for its sort (Kind, Tag, Choice, Percent field, Tag relation, …), another where a definition computes it, where it is, and how many records it has.
      - Opening a row shows everything keyed by the form or its parameterizations: where its records are, by parameterization, with a Required toggle for an entry; its outputs; for a relation, its name, its roles in the order a formula's call takes them, and the name of its list of relatives seen from each side, all editable in place; the definition that computes it, with Edit definition, or Add definition; and, on the chart page, whether the view in use shows it and a Style button that engages its style, or gives it one.
      - Filters narrow it to All, Computed or Unused. A specification nothing has can be removed under Unused, one at a time or all at once with Remove unused.
      - Renaming a relation or a list there renames it in the formulas and view filters that mention it, in the same undoable step. A relation without a name goes by its edge labels, and a name another relation has is refused.
  - A choice's option has a dropdown wherever it appears, including the header path and the title.
  - Relations show at each of their locations:
    - A two-argument relation is a row labeled with the other side's edge, listing the other side's object with the output (checkbox, option or value). Relations that share those labels share the row.
    - Fields located at a relation, like an ownership's Percentage, follow its output a shade lighter, and can be changed in place. Where relations with the same edges have a field that this one lacks, it shows as a blank to fill in. The Relate view shows them the same way, so a Percentage can be typed in right after an ownership is ticked.
    - A relation with more arguments is a table, with one column per other argument. Each column heading is a dropdown that narrows the rows, offering only the locations left in rows that match the other columns.
  - A relation's own panel lists its arguments in the header. Arguments at one location share a line. Path segments below each object are hidden behind "…" unless they're needed to tell parameters with the same edge label apart.
  - New two-argument relations already in the schema can be added from a relation row's "+", or from the Add menu's Relations here, which lists each relation this side can be in by its list name from this side (Owners), with the relation's name and the role this side takes (Ownership · this as Owned). A computed one says so, and adding it attests it by hand. Add › Relation… opens the same Relate view as the chart, for any relation with anything, or a new one.
  - **Definitions** ([formulas.md](../formulas.md)). A definition pairs a scope, the parameterizations it covers, with its rule: a formula, or for a tag, implications. The records it gives are computed, and show in the panel like entered ones, set apart.
    - Their outputs are in italics, and an implied tag's box is outlined rather than filled. An "fx" mark after each one opens an explanation under it: the definition, and for each implication that held, what decided it in words (the comparison and its values, the person it went through, the clause it cited), or failing that, the records it read. A computed relation's own panel explains it in its header.
    - A computed record has no Delete. Its explanation offers Keep as entered, which records its output by hand.
    - Changing a computed record overrides the formula there. Ruling out an implied tag asks first, naming the implications that hold. An entered record that a formula also covers gets a corner mark, as in Excel: amber where it differs from the formula or rules out what it implies, grey where it agrees. Its explanation offers Use formula, or Clear.
    - A formula's errors, like #CIRCULAR! or #DIV/0!, show where its output would be.
    - Relation rows take their list names where there are some: an entity's Owners and Holdings rather than Owner and Owned. A relation's own panel is titled with its name. Rows of computed relations start collapsed, with a count and the first few names.
    - An entry's edit form shows the definition covering every location like it, editable in place, or offers to add one. So does an entered relation's panel.
    - Typing a value that starts with `=` makes it the formula for every location like this one. A new tag can be given a `←` condition instead of being attested. Typing `<-` makes the arrow.
    - The definitions are listed by the forms they compute, in the Schema view's Computed filter. New ones start from Add › Definition… on a record, from New definition in the Schema view or the ribbon, or from Add definition on a form's row, which covers its parameterizations that no definition covers yet.
    - **A definition's view** (under All › Schema) edits its name, type (a tag, a choice, or a field of one of the datatypes), what it covers (an entry's locations, or a relation's parameters and their locations) and its formula or implications. Implications have labels and can be dragged to reorder. Problems are underlined where they are as you type, and names are offered after a dot or as you start one. Saving works everything out again, as one undoable step, and the view lists the results. Renaming a definition there renames it in the formulas and view filters that mention it.
    - The Relate view lists computed relations in a section of their own, with what the definition gives. A tag a definition doesn't imply can still be attested by hand there. Its form for a new relation offers New definition… instead.
    - Renaming an entry offers to rename it here only or at every entry like it, meaning every one of the same form (same label, at locations like this one, whatever kinds a relation relates or options sit above it). Every one is the default, and it renames the label in formulas and names too, in one undoable step.
  - A relation's edge labels can be renamed from its own panel's header, with the same choice. Renaming an edge here only makes the record a different relation, outside the name, formulas and styles of the one it left. A computed relation's edges belong to its definition, so there the pencil opens that.
  - The panel's views have addresses: `#kind:<kind>`, a record's id, `#relate:<a>:<b>`, `#deleted`, `#schema` (with `:computed` or `:unused`), and `#definition:<id>` (or `#definition:new:entry`, `#definition:new:relation`). The older `#formulas` and `#formula:…` lead to the same places.
  - The top bar switches between System, Light and Dark themes.
  - Changes are saved in the browser's local storage, with undo and redo. A workbook saved before the chart kept its schema isn't read, and the pages start again from the sample.
- [tests/model-test.html](tests/model-test.html): checks the model on the sample. Every record's specification must be in the schema and the schema conditions must hold; styles, names, definitions and required entries must point into it; and renames, moves, deletes, type changes, Show and Hide, Copy definitions, naming relations and lists, and requiring entries must keep all of that true. Failures are listed first.
- [tests/formula-lab.html](tests/formula-lab.html): the sample's definitions side by side with their results, a scratch box that works out any expression at any record, and `#selftest`, which checks the results [formulas.md](../formulas.md) claims. It starts from the definitions as the app stores them, written out as people write them, and keeps its own copy to edit.
- [tests/sharepoint-test.html](tests/sharepoint-test.html): checks the SharePoint connector, `core/sharepoint.js`. It covers:
  - reading links of every sort (SharePoint, OneDrive, EDGAR, NetDocuments, iManage, file shares);
  - the demo library, including browsing, search, and saving a workbook when someone else has saved since;
  - the live Graph client, run against a stand-in for Graph.

  Setup for a real tenant is in [docs/sharepoint-setup.md](../docs/sharepoint-setup.md). Failures are listed first.
- [Dappled Wall.html](<../UI/mockups/Dappled Wall.html>): tree-branch shadows on a wall, a candidate background for the loading screen.

## Code

The pages share the code in [core/](core/) (no page code), [ui/](ui/) and [css/](css/). These are plain scripts loaded in order, with no build step.

| File | What it does |
| ---- | ------------ |
| `common.js` | Text helpers, icons, checkboxes, and the theme preference |
| `model.js` | The sample data, with its formulas and pilot names; the state (the schema; entered records, and with them the computed ones; definitions and names; entry order; views with their styles and box positions; required entries; deleted records) with undo and redo; specifications, parameterizations and forms, and their keys; values and their datatypes; reading the state; checking it against [data-model.md](../data-model.md); keeping the schema and what's keyed by it in step as records change |
| `formulas.js` | The formula engine ([formulas.md](../formulas.md)): reading formulas, working out the computed records, explaining them. It touches nothing on the page |
| `lab.js`, `lab.css` | The formula lab |
| `styles.js` | Styles, one per form in each view: presets, the sample styles, what's drawn, Show and Hide, and how styles combine into a box's or line's look |
| `panel.js` | The record panel, with computed records and their explanations, the Schema view (the chart's vocabulary, with its definitions and names), and a definition's view |
| `relate.js` | The Relate view, for relating two things |
| `ribbon.js` | The chart's ribbon |
| `chart.js` | The chart: drawing boxes, routing lines, selecting, moving, editing in place, and relating by drag |
| `sharepoint.js` | The document connector, with no UI, as one global, `SharePoint`: reading document links and choosing their icons; the connection settings; a Microsoft Graph client, signed in through MSAL, for browsing, search, items, sharing links and versions; loading and saving the workbook in a SharePoint library, with a conflict when someone else has saved since; and a demo tenant (Contoso's Fund Legal site) with the same API |
| `export.js` | Exports, made in the browser: the chart as a vector PDF, an editable PowerPoint deck (a slide per view, if asked) or an SVG, and an object's profile as a PDF; and the ribbon's Export tab. Each format draws one scene read off the chart, so it shows what the chart shows. Its libraries load the first time they're used |
| `base.css`, `panel.css`, `chart.css` | Shared tokens and controls, the panel, and the chart page |

## Vendored assets

Third-party files under [vendor/](../vendor/), at the repository root, downloaded from the jsDelivr npm CDN at pinned versions. Each folder has its project's license.

| Folder | Project | Version | License | What's here |
| ------ | ------- | ------- | ------- | ----------- |
| `vendor/tabler-icons/` | [Tabler Icons](https://tabler.io/icons) | 3.49.0 | MIT | 62 outline SVGs |
| `vendor/heroicons/` | [Heroicons](https://heroicons.com) | 2.2.0 | MIT | 35 outline SVGs (24px) |
| `vendor/inter/` | [Inter](https://rsms.me/inter/) via [Fontsource](https://fontsource.org) | 5.1.0 | OFL 1.1 | Variable font, Latin subset (woff2) |
| `vendor/tabler-core/` | [Tabler](https://tabler.io) UI kit | 1.7.1 | MIT | Component CSS and JS (Bootstrap-based); not used by the app |
| `vendor/pico/` | [Pico CSS](https://picocss.com) | 2.1.1 | MIT | Classless CSS for quick mockups; not used by the app |
| `vendor/msal/` | [MSAL for browsers](https://github.com/AzureAD/microsoft-authentication-library-for-js) (`@azure/msal-browser`) | 3.28.1 | MIT | The minified browser build (global `msal`), for signing in to Microsoft 365 from `core/sharepoint.js` |
| `vendor/pptxgenjs/` | [PptxGenJS](https://gitbrent.github.io/PptxGenJS/) | 3.12.0 | MIT | `pptxgen.bundle.js` (477 KB, with JSZip): PowerPoint export |
| `vendor/jspdf/` | [jsPDF](https://github.com/parallax/jsPDF) | 2.5.1 | MIT | `jspdf.umd.min.js` (364 KB): PDF export |
| `vendor/svg2pdf/` | [svg2pdf.js](https://github.com/yWorks/svg2pdf.js) | 2.2.3 | MIT | `svg2pdf.umd.min.js` (85 KB): draws the chart's SVG into a PDF as vectors |

The icons are a curated subset chosen with records in mind: kinds and objects (user, box, cube), fields and datatypes (letter-case, number, calendar, toggle), tags, drag handles (grip-vertical), relations (link, hierarchy, arrows-left-right), and panel controls (edit, plus, trash, chevrons, dots). The full sets are at the links above. Tabler's example HTML pages aren't in its npm package; browse them at https://preview.tabler.io.
