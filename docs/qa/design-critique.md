# Design critique

A review of every page of the app against the exemplars in [ui-research.md](../ui-research.md) and the app's own rules in [design.md](../design.md), made on the production branch (34eb7c5) on October 25, 2026. It covers what's good, what's off, and what to change, specifically enough to build.

**How it was looked at.** Every page opened with the full sample: Home, Chart (all four views, a selected box, the Relate view, the ribbon's tabs and menus, Export, Present), Records (Entities, Individuals, a filter open, rows ticked), three records (the fund, Margaret A. Chen, a document, and each of the fund's tabs), Documents (the preview pane, Link document, Not linked, Broken links), Calendar (agenda, month, an opened Why), History (entries opened), Schema (a row and a definition opened) and Settings. The sidebar, top bar, palette, menus, dialogs and toasts were also checked. Pages were viewed in both themes at 1440×900, 1280×800 and 1024×768, using headless Chrome (see the appendix).

**Mockups.** The images whose names end in `-after-mock` show proposals. CSS and markup were injected into a throwaway copy of the page; the app's code is unchanged. Numbers in the mocked chart panel are illustrative.

**Tags.** Each recommendation has an effort (**S** under a day, **M** a few days, **L** longer), an impact (**high**, **medium** or **low**), and the exemplar it draws on.

---

## Executive summary: the five changes that matter most

### 1. Let the chart lead

The chart is the demo's centrepiece, yet its first look is the weakest screen in the app ([02](img/02-chart-first-look.jpg)):

- **Zoom.** It opens at 40%. Box text is about 4 px high, and the sheet is cut off on both sides.
- **Space.** At 1440 px wide, the app's sidebar (240) and the record panel (432) take 47% of the width. The top bar and ribbon take another 167 px of height. The canvas gets about 53% of the screen.
- **The panel with nothing selected.** It shows "All: Browse records by kind", a list that repeats the sidebar.

Figma's redesign put the canvas first. With nothing selected, Figma's right panel shows the page's own properties, not navigation. Do the same:

- **Sidebar.** On the chart page, start with the app's sidebar hidden. Remember that choice for this page only; Ctrl+\ brings it back.
- **First look.** Open at Fit.
- **Panel with nothing selected.** Show the view itself: its name and as-of date, what needs attention in it, its legend at screen size, the Show checkboxes, and its filter.
- **Ribbon.** Drop the group captions, as Office's simplified ribbon does, and move Undo and Redo to the top bar, where Office's title bar keeps them.

[03](img/03-chart-after-mock.jpg) shows the result: the canvas grows from 768 to 1008 px wide, the fit zoom rises from 28% to 38%, and the panel starts working for the view. **Effort M, impact high.**

### 2. Hold the colour grammar

design.md gives each colour one meaning, but the screens drift from it.

- **Red has four meanings:** a ruled-out tag, a required entry left blank, an overdue date and a formula error.
- **Green has three:** an attested tag, a document's status (Executed, Filed, Final) and the "Saved" dot.
- **The chart shows the clash.** A red asterisk ("required entry blank") sits on a red-dashed box ("good standing ruled out") ([04](img/04-chart-100.jpg)).

Make the grammar explicit and enforce it:

| Colour | Meaning |
| --- | --- |
| Indigo | What can be acted on, and what's selected |
| Purple | What a formula worked out |
| Green | Attested, and nothing else |
| Red | Something negative or failed: ruled out, overdue, an error |
| Amber | Something to do: a required entry left blank, due soon, a draft, an entered value that differs from its formula |

Two other changes go with it:

- **Document status** reads as plain text. Only Draft (amber) and Superseded (faint) are marked. ui-research's own anti-patterns list includes "badges on every row" ([09](img/09-documents.jpg) → [10](img/10-documents-after-mock.jpg)).
- **Chips** become outlined rather than grey slabs, so a row's subject outranks the names in its chips ([11](img/11-calendar.jpg) → [12](img/12-calendar-after-mock.jpg)).

Linear holds its colour back so that colour means something. **Effort S, impact high.**

### 3. One page frame

The same things are drawn differently from page to page.

- **Title position.** The content is centred at six different maximum widths, so at 1440 px the page title starts at 272, 312, 352, 368 or 392 px depending on the page.
- **Titles twice.** Every page names itself twice, once in the top bar ("Entities") and again in the heading under it ("Entities").
- **Create actions.** The create action is a primary button in the top bar on Records (New entity), a secondary one on Documents (Link document), and sits in the page head on Schema (New definition).
- **Switching subsets.** Choosing which subset is listed uses underline tabs on Documents and a segmented control on Schema.

The fix:

- Align every page's content to one left edge.
- Show the title in the top bar only once the page's heading has scrolled away.
- Make the page's create action a primary button in the top bar on every page.
- Use underline tabs with counts for subsets, and segmented controls only for modes, like Agenda and Month.

This is ui-research's principle that stable layouts earn trust, drawn from Figma and Linear. **Effort S to M, impact high.**

### 4. Finish the typography

- **Italics.** Every computed value is set in italics, but only the upright Inter is vendored, so the browser fakes the slant. This affects the agenda, the record panel, the tables, the chart and the exports. Ship Inter's real italic, which is the same Fontsource package and version and 52 KB.
- **Font sizes.** Thirteen sizes are in use (10, 11, 11.5, 12, 12.5, 13, 13.5, 14, 15, 16, 20, 24 and 28 px), against ui-research's scale of eight. Collapse them to tokens.
- **Radii.** Give one radius to each role: buttons are 8 px today but the token says 6, and popovers are 10 px but the token says 8.
- **Dates.** Use one rule. Today the Records table writes "September 8, 2021" and gets cut off, while Documents writes "Jun 30, 2023".

These draw on Inter's own guidance and Vercel's Geist type scale. **Effort S to M, impact medium to high.**

### 5. Make "why" readable by a lawyer

Opening Why on a deadline shows the formula, then a "Because" line written in formula syntax: `[Entity Type] "Limited Partnership" is among {"Limited Partnership", "Limited Liability Company"}; [Vehicle Type] is "AIV", <> "Portfolio Company"` ([13](img/13-calendar-why.jpg)). A partner won't read that.

Lead with a sentence instead: the definition's plain description, then the facts it read ("This AIV-1 is a Delaware limited partnership, so its annual tax is due June 1"), with the formula folded underneath. Airtable lets every field carry a plain description, shown on its header.

In long lists, show Why on hover or focus, and let the italic computed date itself open it. Today a purple "Why" sits on every row. **Effort M, impact high.**

---

## The top 15 recommendations

| # | Change | Where | Effort | Impact | Drawn from |
| --- | --- | --- | --- | --- | --- |
| 1 | With nothing selected, the chart's panel shows the view: its name, as-of date, what needs attention, the legend, the Show checkboxes and the filter | `ui/chart.js`, `ui/panel.js` (the `#kind`/All view on the chart page) | M | High | Figma UI3 (with nothing selected, the panel shows page properties) |
| 2 | Reclaim the canvas: the app sidebar starts hidden on the chart page, the first look is Fit, ribbon captions go, and Undo and Redo move to the top bar | `ui/shell.js` (a per-page sidebar preference), `ui/chart.js` `lookAtChart`, `css/chart.css` `.rb-label`, `ui/ribbon.js` | M | High | Figma UI3, Office's simplified ribbon, Linear (quiet chrome) |
| 3 | Every required-blank mark is amber, not red | `css/records.css` `.rec-req`, `.req-mark`; `css/panel.css` `.req-mark`; `css/chart.css` `--paper-flag`; `ui/record.js:168` | S | High | design.md §4; Linear |
| 4 | Document status is text; only Draft (amber) and Superseded (faint) are marked; green is for tags only | `ui/documents.js:38`, `:470`; `ui/record.js:256`; a new `Parts.status()` | S | High | Linear (colour held back); ui-research §5, "badges on every row" |
| 5 | Chips are outlined, not filled | `css/shell.css:115` `.chip` | S | High | Linear's outlined label pills |
| 6 | One page frame: content aligned left at one gutter, the title shown in the top bar only after the heading scrolls away, and the create action a primary button in the top bar | `css/shell.css:54`, `css/history.css:6`, `css/schema.css:6`, `css/settings.css:5`, `css/record.css:4`, `ui/shell.js` `topbarHtml` | S–M | High | Linear (one header), Vercel (one layout) |
| 7 | Ship Inter's real italic | `vendor/inter/`, `css/base.css` `@font-face` | S | Medium–high | Inter (rsms) |
| 8 | Chart lines: label a shared trunk once, let the legend carry relation names, and spread entry points along a box's edge | `core/sample.js:822` (`st_gp` `format`), `ui/chart.js` line routing | S + M | High | Athennian (relation styles in the legend); yEd/ELK port spacing |
| 9 | Animate view switches, Tidy layout and Fit: boxes glide to their new places, and lines fade | `ui/chart.js` `showView`, `renderChart` | M | High (for the demo) | ui-research §4: "nothing should move silently" |
| 10 | Why in plain words: the definition's description first, then the facts read, with the formula folded underneath | `core/formulas.js` explanations, `ui/agenda.js`, the panel's Why, the definition's view (a Description field) | M | High | Airtable field descriptions |
| 11 | Fix four layout bugs: overlapping text on the record's Documents tab, a toast colliding with the bulk bar, a dialog defaulting to its destructive button, and two Done buttons in Relate | `ui/record.js:250`, `css/records.css`, `ui/shell.js:284`, `ui/relate.js` | S | Medium | Sonner (offsets); platform convention (safe default) |
| 12 | Narrow panel: never break a word in a label ("Jurisdicti / on"); stack the label above the value when narrow; align wrapped relation outputs to the left | `css/panel.css:45`, `:81`, `:171` | S | Medium | Attio's narrow record layout |
| 13 | Agenda and Home rows: Why appears on hover; the italic date opens it; no "Blank" in the date column | `css/agenda.css:38`, `css/home.css:26`, `ui/home.js` | S | Medium | Linear (row actions on hover) |
| 14 | Type and shape tokens: eight font sizes, one radius per role, and short dates in every row | `css/base.css` tokens, then a sweep; `ui/records.js` date cells; design.md | M | Medium | Vercel Geist; ui-research §3 |
| 15 | One control for switching subsets: underline tabs with counts (Documents, and Schema's All, Computed and Unused); segmented controls only for modes | `ui/panel.js` (schema filters), `css/schema.css` | S | Medium | Linear view tabs |

---

## What's already good, and should be kept

- **The shell is calm and Linear-like.** The sidebar has no icons and is quiet; the workspace switcher holds the chart menu; search shows `Ctrl K`; the counts sit right-aligned in tabular figures; the saved status and the user menu, with the theme as an explicit choice, sit at the foot.
- **The palette is Raycast-quality.** It has groups, right-aligned shortcuts, a key hint footer and initials matching ("gp" finds the GP).
- **The record page is Attio's layout done well.** The name, kind and computed badges sit at the top left; the Details on the left are the same component as the chart's panel; the tabs on the right have counts; tags are green or red checkbox rows, and choices are dropdowns.
- **History is the best page in the app** ([20](img/20-history-open.jpg)). It reads as sentences, with the actor in bold, the records as links, runs folded, and the old value shown before the new one. Restore says exactly what it will do.
- **The Documents preview pane is an Ironclad-style metapanel.** It shows what the chart records against what the library says, read live, with the versions. "Open in SharePoint ↗" is the one primary action.
- **Settings is Vercel's layout**: a section list, cards with descriptions, Save in a card footer, and a danger zone last.
- **Toasts with Undo, and empty states that say what's missing** ("Every link works") follow ui-research to the letter.
- **Both themes are complete.** Every token is defined twice, and the dark theme holds up on every page.

---

## Cross-cutting findings

### Colour, audited

| Where | Today | What it means | Verdict |
| --- | --- | --- | --- |
| Records: blank required cell ("Required"), asterisk in a heading | Red (`--danger`) | To do | Should be amber |
| Records: subtitle ("3 missing a required entry") | Amber | To do | Correct |
| Home: "Blank" | Amber | To do | Correct, but see Home |
| Panel `.req-mark`, record header badge "… missing" | Red | To do | Should be amber |
| Chart: required flag on a box (`--paper-flag: #e5484d`) | Red | To do | Should be amber; it currently clashes with the red-dashed ruled-out boxes |
| Overdue dates (Home, Calendar) | Red | Failed | Correct |
| Document status: Executed, Filed, Final | Green badge | Normal state | Should be plain text; green belongs to tags |
| Document status: Draft | Grey badge | To do | Should be amber |
| Sidebar "Saved in this browser" dot | Green | Normal state | Should be neutral (`--text-3`); keep amber for busy and red for errors |
| "Why" links, computed badges, the fx mark | Purple | Computed | Correct |
| The engaged style tile, selected rows | Indigo | Selected | Correct |
| PowerPoint title slide subtitle | Indigo | Decoration | Should be ink-muted; on paper, the accent means nothing |

### The page frame, audited (1440 px wide)

| Page | Content rule | Title's left edge |
| --- | --- | --- |
| Records, Documents, Record | `.content.is-wide`, `.record` (max 1280) | 272 px |
| Home, Calendar | `.content` (max 1120, centred) | 312 px |
| Schema | `.schema-page` (max 1040) | 352 px |
| Settings | `.settings` (max 1008) | 368 px |
| History | `.content.history` (max 960) | 392 px |

**Change (S, high).** Keep each page's comfortable reading width, but align all of them to the same left edge:

```css
/* shell.css */
.content { max-width: 1120px; margin: 0; padding: 28px 32px 72px; }
/* history.css: keep 960 if wanted, but left-aligned */
.content.history { max-width: 960px; }
/* schema.css, settings.css, record.css: replace margin: 0 auto with margin: 0 */
```

Linear and Attio keep the left edge fixed, so moving between pages never moves the title.

**The duplicated title (S, medium).** The top bar shows the crumbs and the page's actions. The title appears there only once the page's heading has scrolled out of view.

- In `Shell.render()`, find the page's own heading inside `<main>`: `.page-title`, `.home-greeting`, `.record-title` or `.schema-page .panel-head h1`.
- Watch it with one IntersectionObserver, and toggle `show-title` on `.topbar` whenever it leaves or enters the view.
- When the page has no heading of its own, set `show-title` for good.

```css
.tb-title { opacity: 0; transition: opacity .15s var(--ease); }
.topbar.show-title .tb-title { opacity: 1; }
```

The chart page, which has no heading of its own, keeps its title in the bar; its record panel's `h1` doesn't count. On a record, the crumb trail stays and only its last part (the name) waits for the scroll. This is the large-title pattern of iOS navigation bars; Vercel likewise keeps only the path in its bar.

**Actions (S, medium).** A page's create action is a primary button in the top bar:

- Records: New entity, already right.
- Documents: Link document, which is secondary today.
- Schema: New definition, which sits in the page head today.

Exports and Present stay secondary. One rule, the same place every time.

### Typography

- **Italics are synthesized (S, medium to high).** `vendor/inter/` holds only `inter-latin-wght-normal.woff2`. Add `inter-latin-wght-italic.woff2` from `@fontsource-variable/inter@5.1.0/files/`. That's the package the vendored upright file came from: both are 48,444 bytes. The italic is 51,924 bytes. Then declare it:
  ```css
  @font-face { font-family: "Inter"; src: url("../../vendor/inter/inter-latin-wght-italic.woff2") format("woff2"); font-weight: 100 900; font-style: italic; font-display: swap; }
  ```
  Inter 4's italic has true italic letterforms and spacing. Computed values, which are most of the upcoming dates on the agenda, will then read as designed rather than slanted. Exports that embed the font need the same addition.
- **Thirteen sizes become eight (M, medium).** Add tokens to `base.css` and sweep the files, mapping as follows:

  | Token | Size / line height | Used for (these values today) |
  | --- | --- | --- |
  | `--fs-caption` | 11/16 | rb-label, kbd, history badges (11, 10) |
  | `--fs-small` | 12/16 | badges, chips, menu heads, group labels, counts, notes (11.5, 12, and 12.5 where it's metadata) |
  | `--fs-dense` | 13/20 | tables, lists, controls, btn-sm, filter chips, menus (12.5 where it's a control, 13, 13.5) |
  | `--fs-body` | 14/20 | body text, the dialog body (13.5 where it's prose, 14) |
  | `--fs-title-sm` | 16/24 | section and dialog titles, the palette input (15, 16) |
  | `--fs-title` | 20/28 | the panel title |
  | `--fs-title-lg` | 24/32 | page titles |
  | `--fs-display` | 28/36 | the Home greeting |

  The half-pixel steps (11.5, 12.5 and 13.5) are where most of the subtle "almost the same" mismatches between pages come from.
- **Dates (S, medium).** The Records table writes dates in full ("September 8, 2021"), so the Formation Date column is cut off at 1440 px ([07](img/07-records.jpg)). The Documents table writes them short ("Jun 30, 2023"). Both are tables sorted by date, so make the rule: full in a record's Details and in exports; short (`Parts.date`) in every row, whether a table, the agenda or the history, with the full date on hover. Update design.md's "Parts" paragraph to match.

### Components

- **Chips (S, high).** `shell.css:115`:
  ```css
  .chip { background: var(--surface); border-color: var(--border); font-weight: 400; }
  a.chip:hover, button.chip:hover { background: var(--hover); border-color: var(--border-strong); }
  ```
  A computed chip keeps its dashed purple border and tint, and stands out more for it. On the Calendar today the chip column is the loudest thing on the screen, louder than the event itself ([11](img/11-calendar.jpg) → [12](img/12-calendar-after-mock.jpg)).
- **Badges.** Keep them for states that need attention: Draft, Superseded, Ruled out, Computed, "… missing" and "In use". A normal state is plain text. Add `Parts.status(text)` so the Documents table and the record's Documents tab draw status the same way, since design.md says to add a part when two areas need the same thing.
- **Dropdowns.** Settings styles its native `<select>`s (`.set-select`: `appearance: none` plus a chevron). The Export dialog, the definition's Type and "Add a location…", and Relate's pickers don't, so they show the operating system's control. Move `.set-select`'s rule into `base.css` as `select.input` and use it everywhere (S, medium). Choices should look like dropdowns everywhere, which is the user's rule.
- **Radii (S, low).** `.btn { border-radius: 8px }` (base.css:140) should become `var(--radius-sm)`, which is 6 px, matching inputs. A 32 px button next to a 30 px search box with different corners is visible on Records. `.pop { border-radius: 10px }` (base.css:171) should become `var(--radius)`. `.check` (5 px) should become `var(--radius-xs)`.
- **A disabled primary button (S, low).** Settings' disabled Save is a washed-out blue that reads as broken. Use:
  ```css
  .btn-primary:disabled { background: var(--pressed); border-color: var(--border); color: var(--text-3); opacity: 1; }
  ```

### Motion

Menus, dialogs, the palette and toasts animate in at the durations ui-research gives. The canvas, the one place where motion carries meaning, doesn't animate at all:

- switching views (boxes take each view's own positions);
- Tidy layout;
- Fit and the zoom steps.

Each of these jumps.

**Change (M, high for the demo).** Animate boxes from where they were to where they go:

1. In `showView` and Tidy, read every `[data-node]`'s rectangle before re-rendering.
2. After `renderChart()`, set each node's `transform: translate(dx, dy)` back to its old place, force a reflow, then transition it to `none` over 240 ms with `var(--ease)`.
3. Fade `#wires` out for those 240 ms and back in, since lines can't be interpolated cheaply.

Under `prefers-reduced-motion`, skip all of it. Switching from Structure to 40 Act then shows the BDC's affiliates gathering around it, which is the moment a room remembers.

Toasts also vanish without an exit animation (`dropToast`). Give them an exit at 75% of the entry duration, as Sonner does (S, low).

### Dark mode

- **Good.** The dark theme mirrors every token; purple, amber and red read well; history, documents and calendar look native in it.
- **The sheet stays white paper, by design.** In dark mode the white sheet and the ribbon's white swatches are the brightest things on screen ([18](img/18-chart-dark.jpg)). Keeping print colours is right. Consider tinting `--paper` in dark mode on screen only (`#f3f2ef`), so it glares less while exports still read the light paper (S, low).
- **The scrim is weak.** At `--scrim: rgb(0 0 0 / .5)` over a #111 page, a dialog barely lifts off the page. Use .6, and give a dark dialog `--border-strong` (S, low).

---

## Page by page

### Shell: sidebar, top bar, palette, menus, dialogs and toasts

**Good.** See above. The user menu's theme switch (System, Light, Dark) answers the "I couldn't find dark mode" feedback directly.

**What's off, and the changes:**

- **The sidebar's counts mean only "how many".** Linear uses a count for what needs you. `.sb-count.is-alert` exists in shell.css:32 but nothing uses it. Show the Calendar's overdue and due-within-7-days count in it (amber); Home could show "Needs attention" the same way. (S, medium. Linear's personalized sidebar.)
- **The saved status dot is green** (shell.css:36). Make it `var(--text-3)`, keeping amber for busy and red for errors. (S, low.)
- **The workspace switcher truncates the chart's name** ("Calder Ridge Fund III…") under a tiny "Rboreal". The chart's name is the most important context in the app. Let it wrap to two lines (`.sb-ws-name { white-space: normal; line-height: 17px }`), or drop the "Rboreal" line once the brand mark is there. (S, low.)
- **The palette's ranking ignores where you are.** Typing "gp" ranks four "GP Written Consent" documents above *Calder Ridge Capital GP III, LLC*. Weight records by kind: entities and individuals first, documents first only on the Documents page. Superhuman: "ranking depends on where the user is". Also show which characters matched (`<b>` in `.palette-title`, at weight 600, with no background). (S, medium.)
- **A delete confirmation focuses its destructive button.** `Shell.confirm({ danger: true })` focuses Delete (shell.js:284, `data-default` on OK), so Enter deletes. Put `data-default` on Cancel when `d.danger` is set. Platform convention is that the destructive choice is never the default. (S, medium.)
- **A toast collides with the bulk bar** ([17](img/17-toast-and-actionbar.jpg)). On Records, ticking rows raises `.rec-actionbar` at the bottom centre while toasts sit at the bottom right; at 1440 px they touch, and narrower they overlap. Add `body:has(.rec-actionbar) { --toasts-bottom: 84px; }` to `records.css`. Sonner stacks toasts above other bottom UI. (S, medium.)
- **The shortcuts sheet** puts "G then H, C, D, A, Y, R or S" in one `<kbd>`. Write `<kbd>G</kbd> then <kbd>H</kbd>` and list the areas in plain text. (S, low.)

### Home ([01](img/01-home.jpg))

**Good.** It's a working page, not a dashboard, as ui-research §6 asks:

- "Needs attention" groups Overdue, the next 30 days and required entries;
- the right column has the chart at a glance, the counts by kind, and what's coming up;
- the greeting with today's date is a warm, plain first impression.

**What's off, and the changes:**

- **Required rows put "Blank" in the date column**, a column every other row uses for a date. Leave the date and when columns empty for these rows, and start the row with a small amber dot before the entry's name, the attention mark proposed for the chart's panel ([03](img/03-chart-after-mock.jpg)). (S, medium.)
- **Nearly every date is in italics** (computed), and with the browser's fake slant (see Typography). The fix is the real italic. Keep the rule.
- **The chips are grey slabs**, which makes the "whose" column the loudest. See the Chips fix.
- **"This chart" draws a grey schematic of rectangles.** Draw the real view in miniature instead: `export.js` already builds the scene (`pictureSvg(scene, false)`), so scale its SVG into the 168 px slot. Athennian's dashboard of saved charts shows each chart, and Figma's file thumbnails are the file itself. (S to M, medium; it's the first chart a demo audience sees.)
- **Two kinds of container.** The left column is bare lists with hairlines; the right column is bordered cards. Either is fine, but not both. Drop the right column's borders and keep its headings as section titles, so the page reads as one surface. (S, low.)

### Chart ([02](img/02-chart-first-look.jpg), [03](img/03-chart-after-mock.jpg), [04](img/04-chart-100.jpg), [05](img/05-chart-management-view.jpg), [06](img/06-chart-panel-1024.jpg), [18](img/18-chart-dark.jpg), [19](img/19-relate.jpg), [21](img/21-present.jpg))

**Good:**

- **The model shows through.** Boxes are styled by form, a computed line is dashed purple, the engaged style is outlined in the gallery and ringed on the chart, and Show and Hide work per view. Formatting lives in a ribbon, as the user asked.
- **The workbook metaphor fits.** View tabs along the foot, like a workbook's sheet tabs, and zoom with Fit, are what a lawyer who knows Excel expects.
- **The paper sheet.** It has a shadow and dots, and holds its print colours.
- **The Relate view meets the spec.** The rest fades, a dashed line marches between the two boxes, and the rows are grouped and sorted into Relations they can be in, Computed, and Needs something first.

**What's off, and the changes:**

1. **The first look**: see the executive summary. To be specific:
   - **Sidebar.** Add `prefs.sidebarOn = { chart: false }` (a per-area override of `prefs.sidebar`) and apply it in `Shell.start` when `area === 'chart'`. The top bar's sidebar button and Ctrl+\ still toggle it, and the choice is remembered. That isn't auto-hiding; it's this page's own stable state.
   - **Zoom.** In `lookAtChart` (chart.js:690), drop the `READABLE = 0.4` fallback, which neither fits nor is readable (4 px text), and open at Fit. Anyone who wants detail zooms in with Ctrl+wheel or the menu.
   - **Legend.** Move the on-screen legend into the panel (below); the sheet keeps it for Present and the exports. The sheet then loses its legend's footprint, and Fit grows further.
2. **The panel with nothing selected repeats the sidebar.** "All: Browse records by kind" lists Documents, Entities, Individuals and so on, which the sidebar already lists, and, with the change above, the panel is the only chrome left. Make it "This view" ([03](img/03-chart-after-mock.jpg)):
   - the view's name, the chart's name and today's as-of date;
   - **Needs attention**: boxes with a required entry blank, boxes the filter errs on, and lines a formula couldn't work out, each a link that selects them;
   - **Legend**: the legend's rows at screen size, readable at any zoom;
   - **Shows**: the Show menu's checkboxes, inline. The mock merges these with the legend; keeping two lists is the safer first step, since the two group things differently;
   - **Filter**: the view's condition, or "Every box", opening the filter menu.

   Records by kind stay one click away in the panel's crumbs. Figma UI3's right panel, with nothing selected, holds the page's own settings. (M, high.)
3. **The ribbon is 119 px tall at every width.**
   - **Step 1.** Hide `.rb-label` (chart.css:46) and lower `.ribbon-body` to `height: 64px` (chart.css:34), saving 20 px. Move Undo and Redo out of the ribbon into the top bar as two `btn-ghost btn-sm` buttons left of Export…, which frees a whole group's width; Office's Quick Access Toolbar puts them there too. (S, medium.)
   - **Step 2.** Offer Office's simplified ribbon, a single 40 px row with the less-used controls in a "⋯" menu, behind a chevron at the ribbon's right end, keeping the classic ribbon a click away. (M, medium.)
   - **The captions' text** ("Style: Kind every object", "Display") moves into the controls' tooltips. The Display dropdown, which shows a bare "Value", needs its own words: "Text reads as: Value ⌄".
4. **Line labels repeat.** The General Partner relation's style has `format: 'label'` (sample.js:822), so the one dashed bus over the four funds says "General Partner" four times in a row ([04](img/04-chart-100.jpg)). The legend already says that dashed means General Partner.
   - (a) In the sample, set `st_gp`'s format to `'none'` (S, high for the first look).
   - (b) In the router, when several lines of one style share a trunk, draw the label once, at the trunk's middle (M, medium).
5. **Routing in "Management and control"** ([05](img/05-chart-management-view.jpg)). Seven people connect to five entities through stacked horizontal channels that all enter each box at the middle of its top edge. The lines overlap, and the labels (Director, 60%, Officer, Employee) pile up at the box tops. Spread the entry points along the edge, ordered by each source's x position so lines don't cross, at least 10 px apart, as yEd's and ELK's port distribution does. Give each source its own channel height. (M to L, high; this view is the one a compliance colleague will ask about.)
6. **The narrow panel breaks words** ([06](img/06-chart-panel-1024.jpg)). At 1024 px the panel is 320 px wide and its labels break mid-word ("Jurisdicti / on", "Vehicle / Type"), because `.label-text { overflow-wrap: break-word }` (panel.css:45) applies inside a 44% column (panel.css:171). Change it to `overflow-wrap: normal; hyphens: auto;`, and below 360 px stack the label above the value:
   ```css
   @container panel (max-width: 360px) {
     .row { grid-template-columns: minmax(0, 1fr); }
     .cell-value { padding-top: 0; padding-left: calc(var(--depth) * var(--indent) + 4px); }
   }
   ```
   (S, medium.)
7. **View tabs at 1024 px truncate to "Fun".** Give `.view-tab-name` `min-width: max-content` and let the tab strip scroll sideways with the same fade the ribbon uses. (S, low.)
8. **Relate has two Done buttons** ([19](img/19-relate.jpg)), one in the bar over the canvas and one in the panel. Keep the bar's: it names the mode, as Figma's "Done" does when editing a component. In the panel, show the two sides as two chips on one line ("Calder Ridge Capital Partners III, L.P. and Calder Ridge Capital GP III, LLC"), not two tall cards that wrap the names onto four lines, and drop the floating "Recorded" caption. (S, medium.)
9. **Present** ([21](img/21-present.jpg)) hides everything, which is right, but leaves the chart undated: its caption names the view for 2.6 seconds, then goes. The PDF prints a title block; Present should too. Draw the same title, view and as-of line at the sheet's top left while presenting. Athennian advises dating every chart, and design.md §6 says exports carry an as-of date; Present is an export to a room. (S to M, medium.)
10. **The Export dialog** is good: options on the left, a live preview of every page, and an honest summary ("Made in your browser; nothing is uploaded").
    - Its `<select>`s are the operating system's (see Components).
    - Its As of field shows "10/25/2026" while the rest of the app writes "Oct 25, 2026". Show `Parts.date` beside a calendar button.
    - The PowerPoint title slide's subtitle is in the accent colour; use the paper's muted ink.

    (S, low.)

### Records ([07](img/07-records.jpg) → [08](img/08-records-after-mock.jpg))

**Good:**

- **A spreadsheet's feel.** Row numbers turn into checkboxes on hover, as in Airtable; the Name column stays in view while scrolling; required columns are marked in their headings; editing happens in place.
- **Filter chips read as sentences.** "Jurisdiction is ▾" opens a list of values with counts and "Remove filter", which is Stripe's and Linear's pattern.
- **A computed column says so in its heading**, with "fx" and italics.

**What's off, and the changes:**

- **Blank required cells say "Required" in red**, and the headings' asterisks are red (records.css:49, :87, :88), while the subtitle's "3 missing a required entry" is amber. Make all of them `var(--warn)`. (S, high.)
- **The table hides columns with no sign.** At 1440 px, Formation Date is cut to "Septemb" at the right edge. Fade the right edge while there's more to scroll, as the ribbon does:
  ```css
  .rec-wrap.has-more-right { mask-image: linear-gradient(to right, #000 calc(100% - 40px), transparent); }
  ```
  Toggle `has-more-right` on scroll, beside the existing `is-scrolled`. With short dates (Typography), this column fits at 1440 anyway. (S, medium.)
- **The quick filter chips shift.** Adding the Jurisdiction filter turned the chips from "+ Entity Type, + Vehicle Type, + Jurisdiction" into "+ Entity Type, + Vehicle Type, + Investment Company Status", so the chip under the pointer changed. Keep the quick chips fixed for the page's session and add new candidates only to "More filters". (S, low. Figma's "stable layouts".)
- **An Individuals column with nothing in it.** "Ownership Adds Up fx" is blank for all seven people. A computed column that is blank for every row should start hidden in the View menu. (S, low.)

### Record ([14](img/14-record-fund.jpg), [15](img/15-record-chen.jpg), [16](img/16-record-documents-tab.jpg))

**Good:**

- **Attio's layout, done well.** The header, the editable Details on the left and the tabs on the right line up on one baseline.
- **Computed relations are drawn as ui-research describes.** "Close Affiliate Of: *Calder Ridge Capital BDC, Inc.*" is a dashed purple chip, and long computed lists fold to a single line ("16 · …").
- **The Dates tab.** Upcoming dates come first, those due within 30 days are amber, then the past ones.

**What's off, and the changes:**

- **The Documents tab overlaps itself** ([16](img/16-record-documents-tab.jpg)). On "Form D/A, Fund III", the line "Regulatory Filing · Jun 28, 2024 · Version Amendment 2024" runs under the "Filed" badge, because the meta spans are `white-space: nowrap` and joined with no space between them (record.js:250), so the line has nowhere to wrap. Fix: `.record-doc-meta { display: flex; flex-wrap: wrap; align-items: baseline; }`. Its status badge is green; see `Parts.status`. (S, medium.)
- **A relation's located field floats** (on the fund, General Partners, then "February 14, 2023" right-aligned on a line of its own; on Chen, the LLCs and Positions). A field located at a relation follows its output, and `.rel-output { margin-left: auto }` (panel.css:81) pushes it to the right edge once it wraps, where it reads as unattached. Let a wrapped output start under the name instead:
  ```css
  .rel-item { justify-content: space-between; }
  .rel-output { margin-left: 0; }
  ```
  A flex line with one item then starts at the left; on one line, the output still sits at the right, so Chen's 60%, 50% and 60% stay aligned. Show the field's label on hover (`title="Admission Date"`). (S, medium.)
- **Chen's "Via" table reads as data, not headings.** A relation of three or more is a table whose header row ("Via ⌄ On Behalf Of ⌄") looks like another row, and its first column, the label column, wraps long entity names over two lines beside their checkboxes. Style the heading row as `.table th` is styled (12 px, `--text-2`, weight 500, a hairline below), and let the first column take `max-content` up to 50%. (S, medium.)
- **The header's computed badges mix checks and classifications.** "Ownership Adds Up" (a check) sits beside "Private Fund" (a legal status) at the same weight. This is a data question rather than a visual one: consider letting a definition be marked "show in the header", and showing failed checks rather than passing ones. (M, low; raise with the user.)

### Documents ([09](img/09-documents.jpg) → [10](img/10-documents-after-mock.jpg))

**Good:**

- **A table, not tiles**, as ui-research says, with tabs for Linked, Not linked and Broken links, and counts on each.
- **The preview pane** (an Ironclad metapanel) compares the record with the library, live.
- **Link document** is clean, with folder breadcrumbs, search, and "Or paste a link".
- **"Every link works"** is a model of an empty state.

**What's off, and the changes:**

- **Status is a badge on every row, mostly green** (documents.js:38). Show it as text; Draft gets the amber badge, and Superseded, Terminated, Expired and Withdrawn are faint, struck through. Of 47 rows, the few that need a lawyer's eye then stand out. (S, high.)
- **"Where it lives" is cut at its start** (`direction: rtl` on `.c-where`, documents.css:44), so it reads "...pital BDC › Regulatory", cutting a word in half. Show the last folder ("Regulatory"), with the full path on hover; the pane shows the whole path. (S, medium.)
- **The Name column gets the least room**: "Close and Remote Affiliate Analys…" while Concerns has 252 px. Narrow Concerns to 220 px and Where to 150 px; Name takes the rest. (S, medium.)
- **The file icon is the same grey PDF glyph on every row.** ui-research allows one icon here, Fluent's file-type icons. When every file is a PDF it carries no information. Use `--text-3` so it recedes, and colour it only when the types differ, as SharePoint does. (S, low.)
- **Link document is a secondary button**, though it's the page's create action. Make it primary (see the page frame). (S, low.)

### Calendar ([11](img/11-calendar.jpg) → [12](img/12-calendar-after-mock.jpg), [13](img/13-calendar-why.jpg))

**Good:**

- **The grouping is right**: Overdue, Next 30 days and Later, with a span on the right ("Nov 1 – Nov 24").
- **The grid aligns**: the date, how far off, the label, whose it is, and the path all line up in columns.
- **The filters work as Stripe's do**: "+ Kind", "+ Object", and "Computed only" as a toggle.
- **Agenda and Month are a segmented control**, which is correct, since they're modes of one view.

**What's off, and the changes:**

- **A purple "Why" on nearly every row** is a column of identical links. Show Why and Open on hover or focus, as Open already is (agenda.css:38):
  ```css
  .ev-why-btn { opacity: 0; transition: opacity .12s; }
  .ev-row:hover .ev-why-btn, .ev-row:focus-within .ev-why-btn, .ev-why-btn[aria-expanded="true"] { opacity: 1; }
  ```
  Make the computed date itself a button that opens Why; its italics, plus a dashed underline in `--computed-border` on hover, mark it as computed. On a touch device (`hover: none`), keep it visible. (S, medium.)
- **The Why is written for the formula's author** ([13](img/13-calendar-why.jpg)). Add an optional plain description to every definition, a "Description" field in the definition's view, and write the sample's 22. Show it first in every Why, in the agenda, the panel and the record. Under it, write the facts read as a sentence ("Entity Type is Limited Partnership; Vehicle Type is AIV, not Portfolio Company; formed February 11, 2025"), and fold the formula under a "Formula" disclosure. (M, high.)
- **Month events show only their label** ("Document Date"), so three "Next Renewal"s on one day can't be told apart. Write "Next Renewal · Fund III-A", using the shortest distinct name, with the full name already in the `title`. (S, medium.)
- **The month the demo opens on (October 2026) is nearly empty**, while the action is in November. Keep Today, but under the grid, when the picked day has nothing, add "Next: Nov 10, Form D Due, BDC →". (S, low.)

### History ([20](img/20-history-open.jpg))

**Good.** This is the strongest page in the app.

- **Entries read as sentences**, with the actor in bold, then the verb, then the record linked, as Linear writes them.
- **A run of like changes folds**, as Linear's collapsed history does.
- **An opened entry is a small card** of the records it touched, each "where" beside the old value and the new. A ruled-out tag shows as a green box then a red one ("Attested → Ruled out"), and Restore explains what it will do.
- **The filters are Stripe-like chips**, and the page's filters live in its address.

**What's off, and the change.** The page is 960 px wide and centred, so its title starts 120 px to the right of Records'. See the page frame. (S.) Its day headings already add the year only for other years, as Linear does.

### Schema

**Good:**

- **One row per form.** Each shows its name, its sort, Computed where a definition computes it, where it is, and how many records have it; opening a row shows what's keyed by it.
- **The definition's view is a real editor**, with problems underlined where they are, and a list of results.

**What's off, and the changes:**

- **Every row carries an outlined sort badge** ("Text field", "Date field", "Tag"), and computed ones add a purple badge as well. Write the sort as plain muted text and keep Computed as the only badge, so the purple is the signal. (S, medium; ui-research §5.)
- **All, Computed and Unused are a segmented control**, though they're subsets of one list; Documents draws its subsets as tabs. Use underline tabs, each with its count, as Documents does. (S, medium.)
- **New definition sits in the page head.** Move it to the top bar as a primary button (see the page frame). (S, low.)
- **The definition's view uses native `<select>`s** for Type and "Add a location…". See Components. (S, low.)
- **The subtitle is the model's own vocabulary** ("The chart's vocabulary, by form: what each is, where, and how it's computed, named and drawn"). That's correct by design.md, but heavy for a newcomer. Suggest: "Every kind of entry and relation in this chart: where it's used, and which ones a formula works out." Keep "form" in the rows, where it's defined. (S, low; raise with the user.)

### Settings

**Good.** It's Vercel's layout, correctly done: a section list, cards with a title, a description and a control, Save in the footer of the card that needs it, and the theme as a segmented control that applies at once. At 1024 px the sections become a row of tabs, which also works.

**What's off.** The disabled Save button is washed-out blue (see Components). Settings is also centred at 1008 px (see the page frame). Nothing else.

---

## Appendix: how the screenshots were made

There's no Node or Python on this machine, so screenshots come from headless Chrome. A small script:

1. copies the page beside itself in `app/` (so `../vendor` resolves);
2. injects a head script that clears `localStorage`, sets `rboreal.prefs` to `{"theme":"light"}` or `{"theme":"dark"}`, and turns `window.onerror` into a red banner;
3. optionally injects a steps script before `</body>`, run 400 ms after load (clicks, `KeyboardEvent`s, or CSS for the mocks);
4. runs:
   ```
   chrome.exe --headless=new --user-data-dir=<fresh dir> --disable-gpu --hide-scrollbars --force-device-scale-factor=1 --virtual-time-budget=8000 --allow-file-access-from-files --window-size=1440,900 --screenshot=<file> file:///C:/…/_qa_<id>_<page>.html#<hash>
   ```
5. deletes the copy and the profile.

The committed images were taken at a device scale of 0.75, as JPEG, to keep them small; they show the full 1440×900 (or 1024×768) layout at three quarters of its size.

| Image | What it shows |
| --- | --- |
| 01-home | Home, light, 1440 |
| 02-chart-first-look | The chart as it opens: 40%, cut off, with the panel listing kinds |
| 03-chart-after-mock | Mock: sidebar hidden, panel as "This view", Fit, no ribbon captions |
| 04-chart-100 | The chart at 100%: "General Partner" four times, red flags beside red-dashed boxes |
| 05-chart-management-view | Management and control at Fit: stacked channels, labels piled at box tops |
| 06-chart-panel-1024 | 1024 px: "Jurisdicti / on", the ribbon clipped, the view tab cut to "Fun" |
| 07-records / 08-records-after-mock | Red "Required", and no sign of the cut column / amber, with an edge fade |
| 09-documents / 10-documents-after-mock | Green badges on every row, "...pital BDC" / status as text, Draft in amber, last folder only, outlined chips |
| 11-calendar / 12-calendar-after-mock | Grey chip slabs, Why on every row / outlined chips, Why on hover |
| 13-calendar-why | A Why written in formula syntax |
| 14-record-fund | The record page, and "February 14, 2023" floating |
| 15-record-chen | Wrapped relation outputs; the Via table's heading row |
| 16-record-documents-tab | Overlapping text: "Version Amendment 2024" under the "Filed" badge |
| 17-toast-and-actionbar | The toast touching the bulk bar |
| 18-chart-dark | Dark: the paper and the ribbon's swatches stay white |
| 19-relate | Relate: two Done buttons, the side cards wrapping |
| 20-history-open | History with two entries opened |
| 21-present | Present: the whole chart, with no title or as-of date on screen |
