# Design

How Rboreal looks and behaves, and how its pages are built. [ui-research.md](ui-research.md) has the exemplars and sources behind it (Linear, Attio, Stripe, Vercel, Figma, Athennian and others).

## Principles

1. **The work is the loudest thing on screen.** The sidebar and top bar are quiet. Content leads.
2. **Structure is felt, not seen.** Use few borders, low-contrast dividers and generous spacing. There is no zebra striping, and no box around everything.
3. **Dense, with hierarchy.** Legal teams want many rows on screen. Keep them, and give the eye a place to land: the name, the date, the status.
4. **Color carries meaning, so it's scarce.** Each color has one meaning, everywhere:

   | Color | Means | For example |
   | --- | --- | --- |
   | Indigo (the accent) | What can be acted on, and what's selected | links, the primary button, a selected row or style |
   | Purple | What a formula worked out | a computed chip, Why, fx |
   | Green | Attested, and a success | an attested tag |
   | Red | Ruled out, overdue, or failed | a ruled-out tag, an overdue date, a formula's error, a save that failed, the one button that deletes |
   | Amber | Something to do | a required entry left blank (its asterisk, "Required", "… missing"), due soon, a Draft, an entered value that differs from its formula |

   A normal state is plain text, never a colored badge: a document that's Executed, Filed or Final, or "Saved in this browser". Color is never decoration.
5. **Labels beat icons.** An icon appears only where it is the clearest label. Examples are search, close, a file's type and the sidebar toggle.
6. **Show where every value came from.**
   - A computed value is set in italics. Its chip or line is dashed, and hovering it says a formula worked it out.
   - Every change is in the History, with who made it and when.
   - Charts and exports carry an "as of" date.
7. **Undo beats "Are you sure?".** An edit takes effect at once, with a toast offering Undo. Ask first only when undo can't bring something back, such as deleting a chart.
8. **Stable layouts.** Things stay where they were. Nothing auto-hides, and nothing moves without an animation the eye can follow.

## Tokens

The tokens are in [app/css/base.css](../app/css/base.css). Use the variables; never hard-code a color.

| Role | Variables |
| --- | --- |
| Surfaces | `--surface` (content), `--sidebar`, `--bg` (canvas and backdrop), `--raised` (menus, dialogs), `--hover`, `--pressed`, `--selected` |
| Lines | `--border`, `--border-strong` |
| Text | `--text`, `--text-2` (secondary), `--text-3` (placeholder and faint) |
| Accent | `--accent`, `--accent-hover`, `--accent-text` (links), `--accent-soft`, `--focus` |
| Meaning | `--yes` and `--no` (tags); `--success-*`, `--warn-*`, `--danger-*`, `--computed-*`, each with `-soft`, `-border` and a solid or text color |
| Type | `--fs-caption`, `--fs-small`, `--fs-dense`, `--fs-body`, `--fs-title-sm`, `--fs-title`, `--fs-title-lg`, `--fs-display` (below) |
| Shape | One radius for each role: `--radius-xs` (4: chips, checkboxes, kbd), `--radius-sm` (6: buttons, inputs, menu items, segmented controls), `--radius` (8: cards, menus and popovers, toasts), `--radius-lg` (12: dialogs and the palette), `--radius-full` (badges, filter chips, avatars) |
| Shadow | `--shadow-pop` (menus), `--shadow-dialog`. In the dark theme borders do the work |
| Motion | `--ease`: 100–120 ms for hovers, 150–200 ms for menus, 200–250 ms for dialogs. Animate only color, opacity and transform |

**Type.** Inter, upright and its true italic (`vendor/inter`), in three weights: 400, 500 and 600. Eight sizes, as tokens; never write a size in pixels, and never a half pixel.

| Token | Size / line height | Use |
| --- | --- | --- |
| `--fs-caption` | 11 / 16 | kbd, avatars' initials, the smallest metadata |
| `--fs-small` | 12 / 16 | badges, chips, counts, menu and group headings, notes under a control |
| `--fs-dense` | 13 / 20 | tables, lists, menus, buttons, filter chips, toasts, the sidebar |
| `--fs-body` | 14 / 20 | body text, dialogs' text, the top bar's title, card titles |
| `--fs-title-sm` | 16 / 24 | section and dialog titles, the palette's input |
| `--fs-title` | 20 / 28 | the record panel's title |
| `--fs-title-lg` | 24 / 32 | page titles |
| `--fs-display` | 28 / 36 | Home's greeting |

Numbers, dates and percentages use tabular figures (`.tnum`, `.num`). Identifiers such as EIN, LEI and file numbers use `.ident`. Labels are never set in all caps.

**Dates.** One rule. A date in a row, whether a table's cell, the agenda or the history, is short, with the full date on hover: `Parts.dateCell(iso)` (Jun 1, 2027). A date read as a value, in a record's Details, the panel or an export, reads in full, as the model writes it: June 1, 2027.

**Spacing.** A 4 px grid. The top bar is 48 px, the sidebar 240 px, and table rows 38 px. The page gutter is 32 px, or 16 px on narrow screens.

## Pages

The app is a set of pages, one per area, sharing one shell and one core. State lives in the workbook, so every page sees the same data. A change on one page shows on another open page at once, through the browser's storage event.

| Page | Area |
| --- | --- |
| `index.html` | Home |
| `chart.html` | Chart |
| `records.html#<kind>` | Records: a table per kind |
| `record.html#<id>` | One record |
| `documents.html` | Documents: the Document kind's table, with the library beside it |
| `calendar.html` | Calendar |
| `history.html` | History |
| `schema.html` | Schema |
| `settings.html` | Settings |

A page loads its scripts in this order:
1. `ui/prepaint.js` in `<head>`;
2. `css/base.css`, `css/shell.css` and the page's own CSS;
3. in `<body>`, the core: `core/common.js`, `core/model.js`, `core/sample.js`, `core/formulas.js`, `core/styles.js`;
4. where the workbook and its documents are kept: `../vendor/msal/msal-browser.min.js`, `core/sharepoint.js`, `core/documents.js` (what the chart records about documents, as the Documents area and a record's page list them), `core/store.js`. Every page loads these, so a change made on any page is saved wherever the workbook lives, and the sidebar's status is true;
5. `ui/shell.js` and `ui/parts.js`;
6. the area's own script, `ui/<area>.js`, which calls `Shell.start(…)`.

There is no build step, and no server: every page opens from a file.

### The page frame

Every page is drawn in one frame, so moving between pages never moves what's on them:
- **One left edge.** A page's content starts the gutter (`--page-gutter`, 32 px) in from the sidebar, under one top margin (`--page-top`), and is never centered. A page that's read (Home, Calendar, History, Schema, Settings) is at most `--page-width` (1120 px) wide: `.content`. A table, or a record's columns, takes the whole width: `.content.is-wide` (Records, Documents, a record). An area that draws a frame of its own (Settings' `.settings`, a record's `.record`, Documents' head and toolbar) uses the same tokens. The chart, a canvas, is full-bleed.
- **The title, once.** A page's own heading is its `.page-title`, Home's greeting and the Schema's heading included. The top bar shows the title only once that heading has scrolled out of view; the crumbs stay. A page with no heading of its own, like the chart, keeps its title in the bar.
- **The create action** is the top bar's last button, primary, with a plus: pass `create: { label, cmd }` to `Shell.start`, which draws it and offers it in the palette. Records' New entity, Documents' Link document and the Schema's New definition are each a page's create action. Other actions, like an export or Present, are ordinary buttons before it.
- **Subsets and modes.** Tabs with counts (`Parts.tabs`) switch between subsets of one list: Documents' Linked, Not linked and Broken links, or the Schema's All, Computed and Unused. A segmented control (`.seg`) switches between modes of one view, like the Calendar's Agenda and Month.

### The shell (`ui/shell.js`)

`Shell.start({ area, kind, title, crumbs, actions, create, render, after, commands, undo, keys })` builds the page around its content, in the page frame (above). `render()` returns the markup for `<main>`. Wrap ordinary pages in `<div class="content">`, and use `.content.is-wide` for tables. The shell calls `render()` again after every change, so `render()` must work from the state alone. Keep transient UI state (an open row, a filter) in a page-level object, and restore focus in `after()` if a re-render would lose it.

What else the shell provides:
- **Clicks.** Use `data-cmd="area.action"` on an element and register the handler with `Shell.on('area.action', (el, e) => …)`. Never use `data-action`, which is the record panel's. Prefix each command with the area.
- **Re-rendering.** After a change, call `render()`.
- **Toasts.** `Shell.toast(text, { undo: true })` after an edit, `{ action: { label, run } }` for anything else, and `{ tone: 'error' }` for a failure the person must see. Keep errors that need action inline, not in toasts.
- **Dialogs.** `await Shell.confirm({ title, body, confirm, danger })` and `await Shell.prompt({ title, value, placeholder, confirm })` ask a question. A dialog of the page's own (the Chart's Export, Documents' Link document) is `Shell.dialog({ title, render, width, className, onOpen, onDraw, keys, onClose })`, which returns `{ el, redraw(), close() }`:
  - `render()` gives its markup from the page's state, using `.dialog-title`, `.dialog-body` and `.dialog-actions` or parts of its own;
  - `redraw()` draws it again in place, without animating it in again, keeping the focus, the caret and where its lists were scrolled; `redraw({ fresh: true })` starts a new step, with the focus on its `[data-autofocus]`;
  - while it's open it has the keyboard: `keys(e)` sees each key first, then Esc closes it and Tab keeps to it. Nothing reaches the page or the shell's shortcuts. Menus and other dialogs open over it, and closing it puts the focus back.
- **Menus.** `Shell.menu(anchorEl, items, id, { search, onClose })`, where items are `{ label, desc, hint, run, checked, ticked, keep, disabled, danger }`, `{ sep: true }`, `{ head }`, `{ note }` or a dropdown, `{ label, select: [[value, text]], value, run }`.
  - `checked` marks the one chosen; `ticked` draws a tick box, for one of several chosen together.
  - Picking a ticked item, one marked `keep`, or a dropdown's value leaves the menu open. It's drawn again from `items`, which may be a function, and follows its anchor (a filter chip as it changes). Anything else closes it.
  - `search` puts a box at the top: `items` is then a function of what's typed, and the arrow keys and Enter pick from it.
- **The record picker.** `Shell.pickRecord(anchorEl, { pick, among, placeholder })` finds an object as the palette does, listing the matches by kind with what tells like names apart. Use it wherever a record is chosen, as History's and the Calendar's filters do. `Shell.findsRecord(id, query)` is its matching, for a list of records of a page's own.
- **The palette.** Add a page's own actions to it through `commands`. It already finds every record and area.
- **Links.** `Shell.recordHref(id)` and `Shell.kindHref(kind)`. Call `Shell.visited(id)` when a record is opened.
- **Saving.** `Shell.setStatus(text, tone)` says where the workbook is saved.
- **Chart switches.** `Shell.onChartChange(fn)`.

### Parts (`ui/parts.js`)

Use these so a record reads the same everywhere:
- `Parts.chip(id, { detail, computed })`: an object as a chip that links to its page.
- `Parts.link(id)`: an object's name, linking to its page.
- `Parts.output(id)` and `Parts.outputText(r)`: a record's output. A tag shows as its checkbox, a document as a link to it, and computed values in italics.
- What a formula has a say in, drawn the same in the panel, a record's page and a table:
  - `Parts.tagBox(id, attrs)`: a tag's checkbox, outlined rather than filled where a formula worked it out. `attrs` say what a click does.
  - `Parts.overrideMark(id, attrs)`: the corner mark, as in Excel, on an entered record a formula also covers, amber where they differ, saying what the formula gives on hover.
  - `Parts.formulaError(code, { href, title })`: a formula's error where its output would be.
  - `Parts.formulaText(definition, value)`: what a formula gives, in words.
- `Parts.dateCell(iso, { computed })`: a date in a row, short (Jun 1, 2027), with the full date on hover, in italics where a formula worked it out. `Parts.date(iso)` is the same as text, for a title or a sentence. Each reads as nothing for what isn't a calendar date. A date in a record's Details or an export reads in full, as the model writes it (`showValue`: June 1, 2027). See Dates, above.
- `Parts.dueText(iso)` and `Parts.daysUntil(iso)`: how far off a date is.
- `Parts.when(stamp)`: a moment relative to now, with the exact time on hover.
- `Parts.badge(text, tone, { href, cmd, title })`, for a state that needs attention, where tone is `''`, `'success'`, `'warn'`, `'danger'`, `'computed'`, `'accent'` or `'faint'` (superseded, set aside). A normal state is plain text. With `href` or `cmd` it goes somewhere or does something, as a record's status badges do, and is ringed on hover. A required entry's "… missing" is `'warn'`.
- `Parts.required(title)`: the asterisk on what's required (a column's heading, an entry's label), in amber.
- `Parts.file(kind, cls)`: a file's type as its glyph, from its link (`SharePoint.parseDocUrl(link).kind`), or a library file's `kind`. `Parts.docStatus(cell)`: a document's status, as plain text when it's in force (Executed, Filed, Final); a Draft is an amber badge and Superseded a faint one.
- `Parts.tabs(list, { current, cmd, label })`: tabs for subsets of one list, each `{ id, label, count, alert }` with its count, as Documents' Linked, Not linked and Broken links. Modes of one view, like Agenda and Month, are a segmented control (`.seg`) instead.
- `Parts.columnHead({ label, sort, cmd, menu, data, cls, extra, title })`: a table's column heading, which sorts by its column when clicked (`cmd`), with a chevron for the column's menu (`menu`) if the table has one.
- `Parts.filterChip({ label, value, text, cmd, clear, data, tone })`: a filter above a list. Unset, it reads "+ Label" and opens its menu (`cmd`). Set, it reads `Label: value` (or `text`, as markup, where a sentence says it better, like Jurisdiction is **Delaware**), opens its menu again, and × clears it (`clear`). Its menu is a `Shell.menu`; a filter that takes several values ticks them, and stays open.
- `Parts.empty({ title, desc, action })`.
- `Parts.avatar(name)`.
- A date, in any list of dates: `Agenda.row(event, { compact, from, plain })` (`ui/agenda.js`, with `agenda.css`), as the Calendar, Home and a record's Dates show it. `from` leaves the record a list is about out of whose each date is; `plain` says whose in words, for a narrow card.

Add a part when two areas need the same thing. Never draw a record two ways.

What two areas read the same way is worked out once, in the core:
- a record's history, with what's inside it and the relations it's in: `historyOf(id)` (model.js);
- what the view in use draws: `hiddenHere()`, `drawnObjects()` and `filterOutcome(text)` (styles.js);
- documents, and what each concerns: `Documents` (core/documents.js).

### Components (`css/shell.css`)

- **Layout:** `.content`, `.page-head` (with `.page-title` and `.page-sub`), `.section` (with `.section-head` and `.section-title`).
- **Cards:** `.card`, with `.card-head`, `.card-title`, `.card-body`, `.card-list` and `.card-row`.
- **Tables:** `.table-wrap` holding a `.table`. Cells take `.num`, `.is-sticky` and `.is-computed`, and the first column's link is `.row-link`.
- **Small parts:**
  - `.chips` holding `.chip`s, outlined so the row they sit in leads;
  - `.badge`;
  - `.tabs` holding `.tab`s (`aria-selected`), each with an optional `.tab-count`, for subsets of one list (draw them with `Parts.tabs`); `.seg` (base.css), a segmented control, for modes of one view;
  - `.empty-state`;
  - `.filters` holding `.filter-chip`s (`.is-set` when a filter is applied; draw them with `Parts.filterChip`);
  - `.search-input`.
- **Buttons:** `.btn`, with `.btn-primary`, `.btn-sm`, `.btn-ghost` or `.btn-danger`; `.icon-btn`; `.link-btn`; and `kbd`.
- **Controls (base.css):** `.input`; a dropdown is a `select.input`, drawn as the app's control with its own chevron, never the operating system's.
- **Text:** `.muted`, `.faint`, `.tnum`, `.ident`, `.computed-text`, `.link` and `.visually-hidden`.
- **What Parts draw:** `.th-sort` and `.th-menu` (a column heading), `.is-implied`, `.ovr-mark` and `.fx-error` (what a formula has a say in), `.req-mark` (what's required), `.doc-glyph` (a file's type) and `.doc-status`, `.badge-link`, and in menus `.menu-tick` and `.menu-choice`.
- **Also:** `.props` (a `dl` of labels and values, for details in a pane), `.skeleton` and `.skeleton-lines` (static loading bars shaped like what's coming).

An area's own styles go in `css/<area>.css`, and may use only the tokens: colors, font sizes and radii alike. A style two areas need belongs in shell.css.

## Interaction

- **Every edit goes through the model.** Use `change()` or the model's functions that call it. Each edit is undoable and lands in the History. Nothing writes the state directly.
- **Tags are checkboxes:** green and checked when attested, red and crossed out when ruled out (`box()` and `checkbox()` in common.js). **Choices are dropdowns.** Fields are edited in place.
- **Editing in place,** as in Excel: a click selects a cell; Enter, a double-click or typing over it edits it; Enter saves, Esc cancels, and Tab moves to the next cell. A control in a cell (a tag's checkbox, a choice's chevron, Name's link) does what it does at once.
- **Tables:** a click on a column's heading sorts by it, ascending, then descending. Where the table has a menu for its columns, a chevron shows on hovering the heading, and a right-click opens the same menu.
- **Keys:**
  - `Ctrl/⌘ K` opens the palette;
  - `G` then a letter goes to an area;
  - `?` lists the shortcuts;
  - `Ctrl/⌘ Z` undoes and `Ctrl/⌘ Y` redoes;
  - `Ctrl/⌘ \` hides the sidebar.

  A page's own keys must not take these.
- **Empty states** say what's missing, when it will appear, and the one action that adds it: "No documents linked yet", then "Link document". An empty result of a filter says so instead, with "Clear filters".
- **Words.** Plain words, in sentence case. Use the model's vocabulary as the Schema view names it: *record*, *entry*, *relation*, *definition*, *formula*, *computed*, *attested*, *ruled out*. Never use jargon the user didn't choose. Buttons say what they do, as in "Link document", not "Submit".
- **Both themes are first-class.** Check every page in light and dark.
