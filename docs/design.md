# Design

How Rboreal looks and behaves, and how its pages are built. [ui-research.md](ui-research.md) has the exemplars and sources behind it (Linear, Attio, Stripe, Vercel, Figma, Athennian and others).

## Principles

1. **The work is the loudest thing on screen.** The sidebar and top bar are quiet. Content leads.
2. **Structure is felt, not seen.** Use few borders, low-contrast dividers and generous spacing. There is no zebra striping, and no box around everything.
3. **Dense, with hierarchy.** Legal teams want many rows on screen. Keep them, and give the eye a place to land: the name, the date, the status.
4. **Color carries meaning, so it's scarce.**
   - The accent (indigo) marks what can be acted on.
   - Green and red mark attested and ruled-out tags.
   - Purple marks what a formula worked out.
   - Amber marks what needs attention.
   - Color is never decoration.
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
| Shape | `--radius-xs` (4, chips), `--radius-sm` (6, buttons and inputs), `--radius` (8, cards and popovers), `--radius-lg` (12, dialogs) |
| Shadow | `--shadow-pop` (menus), `--shadow-dialog`. In the dark theme borders do the work |
| Motion | `--ease`: 100–120 ms for hovers, 150–200 ms for menus, 200–250 ms for dialogs. Animate only color, opacity and transform |

**Type.** Inter, in three weights: 400, 500 and 600.

| Use | Size / line height |
| --- | --- |
| Metadata | 11–12 / 16 |
| Tables and lists | 13 / 20 |
| Body | 14 / 20 |
| Section titles | 16 / 24 |
| Top bar title | 14 / 600 |
| Page titles | 24 / 32 |

Numbers, dates and percentages use tabular figures (`.tnum`, `.num`). Identifiers such as EIN, LEI and file numbers use `.ident`. Labels are never set in all caps.

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
4. where the workbook is kept: `../vendor/msal/msal-browser.min.js`, `core/sharepoint.js`, `core/store.js`. Every page loads these, so a change made on any page is saved wherever the workbook lives, and the sidebar's status is true;
5. `ui/shell.js` and `ui/parts.js`;
6. the area's own script, `ui/<area>.js`, which calls `Shell.start(…)`.

There is no build step, and no server: every page opens from a file.

### The shell (`ui/shell.js`)

`Shell.start({ area, kind, title, crumbs, actions, render, after, commands, undo })` builds the page around its content. `render()` returns the markup for `<main>`. Wrap ordinary pages in `<div class="content">`, and use `.content.is-wide` for tables. The shell calls `render()` again after every change, so `render()` must work from the state alone. Keep transient UI state (an open row, a filter) in a page-level object, and restore focus in `after()` if a re-render would lose it.

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
- `Parts.date(iso)`: Jun 1, 2027. A date read as a value, in a record's entries, a table's cell or an export, reads in full, as the model writes it (`showValue`: June 1, 2027). A list scanned by date, such as the agenda, the history or a date column used for sorting, uses this short form.
- `Parts.dueText(iso)` and `Parts.daysUntil(iso)`: how far off a date is.
- `Parts.when(stamp)`: a moment relative to now, with the exact time on hover.
- `Parts.badge(text, tone)`, where tone is `''`, `'success'`, `'warn'`, `'danger'`, `'computed'`, `'accent'` or `'faint'` (superseded, set aside).
- `Parts.columnHead({ label, sort, cmd, menu, data, cls, extra, title })`: a table's column heading, which sorts by its column when clicked (`cmd`), with a chevron for the column's menu (`menu`) if the table has one.
- `Parts.filterChip({ label, value, text, cmd, clear, data, tone })`: a filter above a list. Unset, it reads "+ Label" and opens its menu (`cmd`). Set, it reads `Label: value` (or `text`, as markup, where a sentence says it better, like Jurisdiction is **Delaware**), opens its menu again, and × clears it (`clear`). Its menu is a `Shell.menu`; a filter that takes several values ticks them, and stays open.
- `Parts.empty({ title, desc, action })`.
- `Parts.avatar(name)`.

Add a part when two areas need the same thing. Never draw a record two ways.

### Components (`css/shell.css`)

- **Layout:** `.content`, `.page-head` (with `.page-title` and `.page-sub`), `.section` (with `.section-head` and `.section-title`).
- **Cards:** `.card`, with `.card-head`, `.card-title`, `.card-body`, `.card-list` and `.card-row`.
- **Tables:** `.table-wrap` holding a `.table`. Cells take `.num`, `.is-sticky` and `.is-computed`, and the first column's link is `.row-link`.
- **Small parts:**
  - `.chips` holding `.chip`s;
  - `.badge`;
  - `.tabs` holding `.tab`s (`aria-selected`), each with an optional `.tab-count`;
  - `.empty-state`;
  - `.filters` holding `.filter-chip`s (`.is-set` when a filter is applied; draw them with `Parts.filterChip`);
  - `.search-input`.
- **Buttons:** `.btn`, with `.btn-primary`, `.btn-sm`, `.btn-ghost` or `.btn-danger`; `.icon-btn`; `.link-btn`; and `kbd`.
- **Text:** `.muted`, `.faint`, `.tnum`, `.ident`, `.computed-text`, `.link` and `.visually-hidden`.
- **Also:** `.th-sort` and `.th-menu` (a column heading, drawn by `Parts.columnHead`), `.props` (a `dl` of labels and values, for details in a pane), `.skeleton` and `.skeleton-lines` (static loading bars shaped like what's coming).

An area's own styles go in `css/<area>.css`, and may use only the tokens. A style two areas need belongs in shell.css.

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
