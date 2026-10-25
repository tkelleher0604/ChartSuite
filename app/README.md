# The app

Rboreal's app. Open any page directly in a browser; it needs no build step or server.

## Pages

Open these directly in a browser. The chart and the record panel share their code and their saved state, so a change made on one page shows up on the other.

Both pages work on a workbook of charts. The chart menu, at the top of the shell's sidebar, switches to another chart, starts a new one (blank, or a copy of this one), renames or deletes this one, and restores a deleted one. Charts don't share records, definitions or views, and each keeps its own undo history. "Copy definitions from" in the same menu brings another chart's definitions and relation names into this one, with the specifications they need, unsynced from then on. A new blank chart starts from the record panel's Entities or Individuals, or from a double-click on the chart.

- [index.html](index.html): Home, the page a lawyer opens first, greeting them with the chart's name and today's date.
  - **Needs attention:** deadlines overdue or due in the next 30 days; required entries left blank, a line per requirement with the records lacking it; and formula errors, a line per definition. Each links to where it's fixed.
  - **Recent changes:** the latest of the history, with who and when, each linking to the record it touched. **Recently viewed:** the records the palette lists as Recent.
  - On the right, the current view in outline, the records by kind (linking to their tables), and the agenda's next few dates.
- [calendar.html](calendar.html): every date in the chart, entered or computed, as one agenda.
  - Each date shows how far off it is, its label, and whose it is: its object as a chip, with the path below (a registration, a jurisdiction); or, for a date at a relation, the relation's name and its objects in order. Its label opens the date on its record's page, with why a definition gave it.
  - **Deadlines and history.** A date a definition covers is a deadline: one it worked out, or one entered over its formula, like an extension. A past deadline is overdue, since its rule hasn't moved on. An entered date that no definition covers records a fact, so once past it's history. Labels decide nothing.
  - **Agenda:** Overdue, This week (today and the six days after), Next 30 days, Later, and Past, collapsed. Up, Down, J and K move between rows; Enter opens one.
  - **Month:** a grid of the month, and the day picked in it below. The arrow keys move a day or a week, Home and End to the week's ends, and Page Up and Page Down a month.
  - **Filters:** by kind; by object, with what it reaches through any of its lists of relatives, directly and indirectly (a fund and its Holdings, a person and their Controlled Companies); and to computed dates. The view, day and filters are in the address, as `#view=month&day=…&kind=…&object=<id>&reach=Holdings|…&computed=1`.
  - **Why** explains a date a definition gave, or one entered over its formula: the definition, its formula, and what it read.
  - **Export to Outlook** saves what's shown as an .ics file of all-day events, each named for what it is and whose, with a link back to its record. Past dates are left out unless asked for.

- [chart.html](chart.html): the chart, in the app's shell, as a full-bleed canvas: the ribbon above it, the record panel on the right, and along its foot the view tabs, the legend's switch and the zoom. The top bar names the chart, with Export… and Present on its right. The sidebar switches charts and themes.
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
    - The sample ([docs/sample.md](../docs/sample.md)) has four views:
      - Structure, which leaves out the people who hold nothing;
      - 40 Act, laid out around the BDC, which hides ownership and draws the BDC's close affiliates (dashed) and remote affiliates (dotted), both in the computed purple;
      - Fund III, the fund family alone: its investors, vehicles, GPs and holdings;
      - Management and control: the people, and the sponsor's entities they own and hold positions in, with their positions drawn.

      None draws boxes for its documents or service providers; View › Show brings them.
  - **Show and hide**, in the View tab, act on the current view only.
    - The Show menu lists what the view can draw, by form, each with a checkbox: Boxes, one per kind; Lines, the entered relations by name; Computed lines; and Text, the entries a box can show. Turning one on or off sets whether its style draws it in this view, so a relation goes for every kind it relates. Text a line shows, like an ownership's Percentage, comes and goes with the line. A computed relation's line is dashed and purple, as everything a formula works out is marked, unless its style says otherwise.
    - Hide hides the selected box or line in this view, and the Hidden menu shows them again.
    - Filter boxes holds a condition, worked out at each object like an entry's formula, that says which boxes the view shows; lines to hidden boxes go with them. The 40 Act view's shows the BDC and its close and remote affiliates. The menu checks the condition as it's typed and says how many boxes it would show. A box where the condition runs into an error stays shown, with a red mark.
    - Tidy layout, offered when a view hides boxes, lays out the ones it shows in rows along ownership and control, in this view only.
    - A computed relation is drawn only where a style shows it. Adding a new relation draws it in the current view and leaves it hidden in the others.
  - **Formulas tab.** Definitions opens the panel's Schema view on its computed forms. New definition starts one, of an entry or of a relation (a relation starts from the selected box, or the two being related). Why? opens the selected computed line, or line of text, in the panel. Calculation says how many computed records the definitions gave, how long it took, and how many errors there are.
  - **The legend** says what the view's looks mean: a row for each look a style gives the boxes drawn (outputs that look alike share a row), grouped by the style's form, then a row for each kind of line, computed ones in italics. Text styles aren't listed. It sits on the sheet under the drawing, and the switch at the foot of the chart (or View › Legend) hides it.
  - **Export…**, in the top bar, opens a dialog with the choices on the left and a live preview of every page or slide on the right, drawn from the same layout the file is made from:
    - Format: PDF (vector), PowerPoint (a title slide, then the view as editable shapes: boxes with their text in them, lines as single paths, labels as text boxes, in the chart's colors and dashes) or SVG (the view as a picture, with the legend as the sheet shows it).
    - Views: this view, or every view, a page or slide each.
    - Page size (Letter, A4 or Tabloid, and an orientation, by default to suit each view) or slide size (16:9 or 4:3).
    - As of: the date printed in the footer, today by default.
    - Include the legend, beside the chart or below it, wherever the chart comes out larger.
    - With a box selected, Profile of it saves a PDF of its entries and its relations by name, computed values in italics. So does the palette's Export a profile.
    Everything is made in the browser, and nothing is uploaded.
  - **Present** hides everything but the chart (the sidebar, top bar, ribbon, panel and the bar along its foot), full screen where the browser allows, and fits the chart to the screen. The arrow keys step through the views, each fitted, and Esc comes back to where things were.
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
  - **Zoom.** Ctrl+wheel, or − and + at the foot of the chart, zooms; the percentage between them opens a menu of sizes, and Fit (or Shift+1) fits the whole sheet to the screen. The chart opens as it was left in this session; a chart not looked at yet opens whole if it's readable that way, and otherwise from the top. The panel's left edge drags to resize it.
  - What a change did is said in a toast, with Undo when it was an edit.
  - The command palette (Ctrl+K) has the page's actions: Export…, Present, Fit to screen, the views, Tidy layout, the legend and the panel. On the sample chart, Reset sample puts it back as it started, with its views and formulas; Undo brings the changes back.
- [record.html](record.html): one record, at `record.html#<id>`, laid out like Attio's record page.
  - **The header** has the record's name, its kind with its first choices (Entity · Limited Partnership · 3(c)(7) Fund), and its status: a purple badge for each tag a formula found true of it (Private Fund, Investment Company), which opens its explanation, and a red one for required entries left blank, which goes to the first.
  - **The top bar** has the path (Records › Entities, or Documents for a document), and the record's actions: Open document for a document, Open on chart (which selects its box, unless the chart's view doesn't draw it), Export profile (a PDF of its entries and relations), and a menu with Copy link and Delete. Delete takes effect at once, with Undo in a toast; the record and what depends on it go to Deleted.
  - **Details**, on the left, are the record panel's view of the record (below), edited there just as beside the chart, starting opened out. Its links to records go to their pages, and to definitions, to the Schema. Add › Relation… relates the record to something in place of its Details, until Done. What a change did is said in a toast with Undo; what it couldn't do, above the Details. Leaving a record with a required entry blank asks in a dialog.
  - **The tabs**, on the right:
    - Relations: the record's relatives in each list they're in from here (Owners, Holdings, General Partners), at the record or inside it, as chips with what the relation says (64%, Director). Computed ones are dashed, and a long list only formulas give is folded to a line until opened.
    - Documents: the documents that concern it, as the Documents area lists them (a Document related to it by Concerns, or a document field on it), newest first, each with its file's glyph, its type, date, version and status, and Open.
    - Dates: every date in it and on the relations it's in, entered or computed, as the Calendar's agenda groups and shows them (overdue, this week, the next 30 days, later, past), with the record itself left out of whose each is.
    - History: each change to it, to anything in it, or to a relation it's in: who, when, the change in a sentence, and each value before and after.
  - The hash can name any record. An entry opens its record with the entry shown, and its explanation if a formula is behind it; a relation opens the relation's own page; a deleted record says so, with Restore; nothing at all (as after a chart switch) says so calmly, with a way back to Records.
  - With too little room for two columns, Details become the first tab. The last tab picked is remembered.
- **The record panel** (`ui/panel.js`): a record's Details on its page, and the side panel on the chart, with adding, editing, deleting and reordering entries, and relations. ([record-panel.html](record-panel.html), where it once stood on its own, now sends its visitor to the record's page, or to Records.)
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
- [history.html](history.html): every change to the chart's data, newest first, grouped by day.
  - An entry says who made the change, what it was, in the history's own words with the records it names as links, and when. Undo, Redo, Reset and Import say so in a badge. A summary that only counts records is followed by the objects they're on.
  - Opening an entry lists each record it touched, where it is as it was then, and what became of it: the old value struck through beside the new one, or Added or Deleted.
  - A run of like changes in a row by one person (the same verb, to the same sort of thing) folds under its first, as "4 more changes like this", except while searching.
  - Filters for the person, a record (found with the record picker; its history takes in everything in it and the relations it's in, as its own page's History tab does), what changed (records, definitions, names, required entries or the schema) and a date range, and a search, are kept in the address so a filtered history can be linked to: `#record=<id>&who=<name>&what=records&from=2026-01-01&to=2026-03-31&q=<words>`.
  - Export CSV saves the changes shown, one row for each record a change touched.
  - Restore this, on an opened entry whose records are still as it left them, puts them back as they were before it, as an ordinary undoable change that the history records in its turn: a deletion by restoring its batch from Deleted, an addition by deleting what it added. Otherwise the entry says why it can't be restored.
- [schema.html](schema.html): the Schema view and a definition's view from the record panel, at full width, at the same addresses (`#schema`, `#schema:computed`, `#definition:<id>`, …). Links to records and kinds go to their pages, each change is confirmed in a toast with Undo, and a rule's implications take a line each. The palette opens any definition by name.
- [settings.html](settings.html): Settings, its sections listed on the left and its cards in one column.
  - **You:** your name, which the History records changes under (with SharePoint signed in, it offers the account's name), and the theme, which applies at once.
  - **Workbook:** where it's kept, and export and import.
    - The workbook is one JSON document. This browser always holds the working copy, so pages open at once and tabs stay in step, and it's kept in one of three places: this browser alone; a file (Open… and Save as…, through the File System Access API, in a folder OneDrive or SharePoint syncs if you like; where the API is missing, Open… and Download); or a SharePoint library (Open… and Save as…, by the workbook's name in the library's Rboreal folder).
    - A change is saved there a moment after it's made, and the sidebar says how that stands: "Saved to Fund Legal › Rboreal · 2 min ago", "Saving…", or what's wrong. Offline or signed out, changes are kept in the browser until they can be saved. A page that opens with nothing unsaved takes the copy there if someone has saved it since.
    - Which chart and view are open aren't saved there, so switching them changes nothing.
    - If someone saved there while this browser had changes too, both copies are kept, and a card says who saved and when, with three choices: keep mine (save it over theirs, which stays in SharePoint's version history), take theirs, or save mine as a copy under a new name.
    - Export downloads the workbook as JSON. Import reads one: a chart that's here too (the same chart, by its id) is replaced, as one change of that chart that Undo takes back and the History records, with both histories kept; or, if you choose, every chart is added as a new one. Charts the file lacks are left alone.
  - **SharePoint:** the connection (demo, or live with the tenant ID, client ID, site, library, workbook folder and redirect URI from [docs/sharepoint-setup.md](../docs/sharepoint-setup.md)), who's signed in, and a test that finds the site, the library and the workbook folder. In the demo, a colleague can save the library's copy, to show what two people saving at once looks like.
  - **This chart:** its name, and Reset to the sample, which Undo takes back and the History records.
  - **Danger zone:** clearing this browser's copy, after saying what would be lost and what stays.
- [documents.html](documents.html): the index to the document library. SharePoint keeps the files; the chart keeps what each one is and which records it concerns.
  - **What a document is.** A record whose output is a field of datatype `document`, its address. Most sit on objects of the Document kind, with a Document Type, Document Date, Status and Version beside them and a Concerns relation (Document, Subject) to the records they're about, whose list seen from a subject is Documents. So the page is the Document kind's table too, and the sidebar doesn't list the kind under Records. A document field anywhere else, like a link on an entity, is listed as well, typed by its label and concerning its record.
  - **Linked**: every document, with its file type, name, type, the records it concerns, date, status, and the folder it's in. Search, filters for type, status and the records it concerns (taking in what they own, by ownership, if asked), and sorting by any column. Columns give way, least needed first, as the table narrows. A link that no longer leads to a file is flagged.
  - **The preview pane**: selecting a row (or ↑ and ↓, J and K) opens the document: what the chart records, then what the library says, read live (its folder, version, who changed it and when, size, the library's own columns, each marked where it differs from the record), and its versions. Open in SharePoint, Copy link and Edit details. Enter opens the record, Esc closes the pane.
  - **Link document** browses or searches the library, or takes a pasted link (a sharing link, a file's address, or a link elsewhere, like EDGAR). It records the file as a Document in one undoable change, with its type, date, status and the records it concerns filled in from the library's columns and the file's name, to check and change first. A chart's first document names the Concerns relation and hides Document boxes on the chart, which View › Show brings back.
  - **Not linked** lists the library's files that no record links to. Link records one in one click, as the pane says it will; Undo takes it back.
  - **Broken links** lists the documents whose link SharePoint can't find, each to be linked again to the file wherever it went.
  - The top bar says which library this is: the demo (Contoso's Fund Legal library, so the app works offline) or the one connected in Settings, with a menu to sign in or read the library again. The demo has no real files, so opening one says so.
  - Addresses: `#<document id>`, `#not-linked` and `#broken`.
- [records.html](records.html): a table for each kind, at `records.html#<kind>`, which the sidebar's Records list links to. With no kind named, it shows the first.
  - Rows are the kind's objects. Columns are the entries the schema has at objects of the kind, in the entry order the record panel keeps, with Name first and kept in view as the table scrolls. Entries below entries (an Entity Type's Tax Classification, a Jurisdiction's File Number) can be shown too, and so can the lists of each object's relatives by list name (Owners, General Partners, Documents), each relative a chip with its one detail, like an ownership's Percentage. A relation of more than two shows its other sides in the chip's detail (Margaret A. Chen · via Calder Ridge Capital GP III, LLC).
  - **Editing in place.** As in Excel, a click selects a cell, and a double-click, Enter or typing over it edits it. A field's value is read in its datatype and shown in its format; a choice opens its options (as its chevron does), where typing finds one or adds a new one; a tag's checkbox attests it, then rules it out, then attests it again. Enter saves and moves down, Tab saves and moves right, Esc cancels, and arrows move. Delete clears a cell, sending its entry to Deleted. A blank cell adds the entry its object lacks. Every edit goes through the model, so it's undoable and in the History.
  - What a formula works out is in italics, and its column's heading says so, with the formula on hover. It isn't edited here, except that a computed tag can be ruled out (or attested), which asks first and then overrides the formula there. An entered value a formula also covers has Excel's corner mark, amber where they differ, with Use formula. A blank required entry says Required, and a formula's error shows where its value would be.
  - **Pasting from Excel.** Tab-separated cells fill the table from the active cell, rightward and down, adding rows past the last, as one undoable step. A block whose heading row names Name is matched by heading and by name instead: unknown headings become new entries, of the datatype their values read as (yes-or-no values make a tag), and unknown names new rows.
  - **Finding and arranging.** A click on a heading sorts by its column, ascending then descending; its chevron, shown on hover, or a right-click opens its menu, to sort, filter by it or hide it; and dragging a heading reorders the entries, for every object of the kind. Filter chips above the table read as sentences (Jurisdiction is Delaware), offering the choices that tell the most rows apart; a search box looks through what's shown; the View menu shows and hides columns, staying open as they're ticked. A filter's menu stays open too, as its values are ticked. Columns shown and the sort are kept per kind in this browser, and filters and the search in this tab. The count under the title links to the rows with a required entry blank.
  - **Rows together.** Ticking rows (shift-click for a range) brings up a bar to copy them, as tab-separated text with headings, or delete them, with Undo. Export CSV saves what's shown. New entity, or the row at the bottom, names a new object: Enter adds it and starts another, and Tab adds it and moves on to fill it in.
- [tests/model-test.html](tests/model-test.html): checks the model on the core of the sample. Every record's specification must be in the schema and the schema conditions must hold; styles, names, definitions and required entries must point into it; and renames, moves, deletes, type changes, Show and Hide, Copy definitions, naming relations and lists, and requiring entries must keep all of that true. Then it checks the whole sample: the same invariants, how fast it's worked out (under 100 ms), every deadline's date and how meeting one moves it on, the required entries left blank on purpose, its documents and what's on file, its history (walked back to a state at every step), and what each view draws. Failures are listed first.
- [tests/formula-lab.html](tests/formula-lab.html): the definitions of the sample's core side by side with their results, a scratch box that works out any expression at any record, and `#selftest`, which checks the results [formulas.md](../formulas.md) claims. It starts from the definitions as the app stores them, written out as people write them, and keeps its own copy to edit.
- [tests/sharepoint-test.html](tests/sharepoint-test.html): checks the SharePoint connector, `core/sharepoint.js`. It covers:
  - reading links of every sort (SharePoint, OneDrive, EDGAR, NetDocuments, iManage, file shares);
  - the demo library, including browsing, search, and saving a workbook when someone else has saved since;
  - the live Graph client, run against a stand-in for Graph;
  - the sample's documents: each Link a file in the demo library, and every file indexed but the three left out on purpose.

  Setup for a real tenant is in [docs/sharepoint-setup.md](../docs/sharepoint-setup.md). Failures are listed first.
- [tests/store-test.html](tests/store-test.html): checks `core/store.js` against the demo library and a stand-in for a file: saving, taking a newer copy, conflicts and each way out of one, signed out and offline, export and import, and clearing. It sets the browser's saved workbook aside while it runs, and puts it back after. Failures are listed first.
- [Dappled Wall.html](<../UI/mockups/Dappled Wall.html>): tree-branch shadows on a wall, a candidate background for the loading screen.

## Code

The pages share the code in [core/](core/) (no page code), [ui/](ui/) and [css/](css/). These are plain scripts loaded in order, with no build step.

| File | What it does |
| ---- | ------------ |
| `common.js` | Text helpers, icons, checkboxes, and the theme preference |
| `model.js` | The state (the schema; entered records, and with them the computed ones; definitions and names; entry order; views with their styles and box positions; required entries; deleted records) with undo and redo; specifications, parameterizations and forms, and their keys; values and their datatypes; reading the state; checking it against [data-model.md](../data-model.md); keeping the schema and what's keyed by it in step as records change |
| `sample.js` | The sample ([docs/sample.md](../docs/sample.md)): its core, which formulas.md, model.html, the formula lab and the model test are about, and the fund complex a chart starts from, with its records, box positions, relation names, definitions (the deadlines and what's on file among them), required entries, entry order, views, and the history that made it |
| `formulas.js` | The formula engine ([formulas.md](../formulas.md)): reading formulas, working out the computed records, explaining them. It touches nothing on the page |
| `lab.js`, `lab.css` | The formula lab |
| `styles.js` | Styles, one per form in each view: presets, what's drawn, Show and Hide, how styles combine into a box's or line's look, and what the view in use draws (its filter worked out at each object, and what it hides), which the chart, its ribbon, Home's thumbnail and a record's Open on chart all go by |
| `shell.js`, `shell.css` | The shell every page shares ([docs/design.md](../docs/design.md)): the sidebar, the top bar, the palette, menus (which can search, and tick several while staying open), dialogs (`Shell.dialog`, and confirm and prompt on it), the record picker (`Shell.pickRecord`), toasts and keys; and the components the areas are built from |
| `parts.js` | What every area draws records with, so a record reads the same everywhere: chips, outputs, a computed tag's box and the corner mark on an entered value a formula covers, dates and times, badges, a document's file and status, filter chips, column headings that sort, empty states |
| `panel.js` | The record panel, with computed records and their explanations, the Schema view (the chart's vocabulary, with its definitions and names), and a definition's view. Its host sets `panelOptions`: whether it's a record's page, where its links go, and how it asks a question on leaving |
| `record.js`, `record.css` | The record page: the header, the panel as Details, and the Relations, Documents, Dates and History tabs |
| `relate.js` | The Relate view, for relating two things |
| `history.js`, `history.css` | The History page: reading the history log back from the records as they are now, so each change is told in its own time's names; days, runs, filters in the address, restoring, and CSV |
| `schema.js`, `schema.css` | The Schema page: the panel's Schema and definition views as a page of their own |
| `ribbon.js` | The chart's ribbon: Home (the engaged style's formatting), Insert, Formulas and View |
| `chart.js` | The chart page: drawing boxes, routing lines and the legend, selecting, moving, editing in place, and relating by drag; the view tabs and zoom at the chart's foot; presenting; and starting the shell |
| `sharepoint.js` | The document connector, with no UI, as one global, `SharePoint`: reading document links and choosing their icons; the connection settings; a Microsoft Graph client, signed in through MSAL, for browsing, search, items, sharing links and versions; loading and saving the workbook in a SharePoint library, with a conflict when someone else has saved since; and a demo tenant (Contoso's Fund Legal site) with the same API |
| `documents.js` (core) | What the chart records about documents, with no UI, as one global, `Documents`: the entries a document's details are read from, the Concerns relation and what a document concerns, and every document as it's listed, by the Documents area and a record's page alike |
| `agenda.js` | The chart's dates as events (what, whose, when, and whether a rule gives them), grouped as the agenda groups them; an event's row and its Why; whose something is, as chips; and the .ics export. Home, the Calendar and a record's Dates share it |
| `calendar.js`, `home.js` | The Calendar and Home |
| `store.js` | Where the workbook is kept, with no UI, as one global, `Store`: the working copy in local storage, saved to a file or a SharePoint library by one sync model (saves that name the version they replace, a newer copy taken when nothing here is unsaved, conflicts that keep both copies); the status the sidebar shows; export and import |
| `settings.js`, `settings.css` | The Settings page |
| `export.js` | Exports, made in the browser: the chart as a vector PDF, an editable PowerPoint deck or an SVG, a page or slide per view if asked, and an object's profile as a PDF; and the Export dialog, with its live preview. Each format draws one scene read off the chart, laid out on one page layout (title, chart, legend, footer), so it shows what the chart shows, and the preview shows what the file will. Its libraries load the first time they're used |
| `agenda.css`, `calendar.css`, `home.css` | The agenda's rows, the Calendar, and Home |
| `documents.js` (ui) | The Documents area: the index of documents (core/documents.js); the library read live through the connector, a few requests at a time; the preview pane; linking, editing and relinking, each one change through the model; and what no record links to |
| `base.css`, `panel.css`, `chart.css`, `documents.css` | Shared tokens and controls, the panel, the chart page, and the Documents area |
| `records.js`, `records.css` | The Records area: a table per kind, its columns read from the schema, cells edited in place through the model, pasting from Excel, sorting, filter chips, search, column choice, ticking and deleting rows, and CSV export |

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
