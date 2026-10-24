# UI

Working area for Rboreal's frontend design.

## Mockups

Open these directly in a browser. The chart and the record panel share their code and their saved state, so a change made on one page shows up on the other.

- [mockups/chart.html](mockups/chart.html): the chart, with a ribbon above it and the record panel on the right.
  - Every object is a box, and every two-argument relation is a line from its first argument to its second. Percentages sit just above the box a line reaches.
  - **Styles.**
    - A style is a parameterization together with a map from its outputs to formatting: shape, fill, outline, font, and whether the record shows as a line of text in its box (or, for a relation, as a line).
    - Every object has the same parameterization, whose outputs are the kinds, so the Kind style gives each kind its box.
    - A new kind gets the preset: a plain rectangle and a bold Name.
    - Later styles in the list override earlier ones.
  - **The engaged style.**
    - One style is always engaged, and the ribbon's formatting controls edit it. A change therefore applies everywhere the style's entry for that output applies, never to a single box. A scope menu picks the output, or every output.
    - The engaged style is outlined in the ribbon's gallery and highlighted in the panel, on its row or on the kind under the object's name. Its text is ringed on the chart.
    - Controls showing a value that comes from another style are muted. A dot marks a value that a later style overrides on the selected box.
  - Clicking a box selects it and opens its object in the panel. Clicking a line of text in a box engages that text's style. Clicking a line opens its relation.
  - **Editing a name in place.** Double-click a name, press F2, or just start typing over a selected box. The panel follows as you type. Enter saves and Esc cancels.
  - **Moving and deleting.** Drag a box to move it, or nudge it with the arrow keys. Delete asks before removing an object along with everything recorded about it.
  - **Creating boxes.** Double-click the sheet to add a box of any kind there, or of a new kind. The Insert tab does the same at the middle of the view.
  - **Relating two boxes.** Drag from a box's edge handle to another box.
    - A moving dashed line joins the two boxes. The rest of the chart fades and takes no input until Done or Esc.
    - The panel is headed by the two sides. Its rows list every kind of relation in the schema that the two are inputs to, with one row per way of placing them among its parameters.
    - A recorded relation shows its output. An unrecorded one offers a checkbox, a value box or an option menu to record it.
    - Some parameters sit below an object, such as an LLC's Entity Type. Those are filled through that record, and if the object lacks it, the row says what's missing.
    - Relations with more than two parameters get pickers for the rest.
    - A new kind of relation can be defined at the bottom, with a role for each side and where each side's end sits.
  - **Adding styles.** Use Add › Style… in the panel or New style in the ribbon to style the chart by another entry.
  - Ctrl+wheel or the zoom buttons zoom. The panel's left edge drags to resize it.
- [mockups/record-panel.html](mockups/record-panel.html): the record panel on its own, with adding, editing, deleting and reordering entries, and relations.
  - Adding starts with a name box whose list offers the labels already used at matching locations, plus Create.
  - A tag is added as soon as it's named. Its name sits in the label column and its output, a checkbox, in the value column: green when attested, red and crossed out when ruled out. Hovering previews the other state, and a click switches to it.
  - A choice moves on to an option box listing the outputs of its parameterization, and afterwards shows its option with a dropdown chevron.
  - A field moves on to a value box that detects the datatype.
  - Entries can be dragged by their handles (or moved with Alt+Up and Alt+Down) among their siblings, with Name kept first. The order is shared by every location with the same specification.
  - Each change is checked against the state and schema conditions in [data-model.md](../data-model.md), matching labels and options without regard to case.
  - A choice's option has a dropdown wherever it appears, including the header path and the title.
  - Relations show at each of their locations:
    - A two-argument relation is a row labeled with the other side's edge, listing the other side's object with the output (checkbox, option or value). Relations that share those labels share the row.
    - A relation with more arguments is a table, with one column per other argument. Each column heading is a dropdown that narrows the rows, offering only the locations left in rows that match the other columns.
  - A relation's own panel lists its arguments in the header. Arguments at one location share a line. Path segments below each object are hidden behind "…" unless they're needed to tell parameters with the same edge label apart.
  - New two-argument relations of the kinds already in the state can be added from the Add menu or a relation row's "+". Add › Relation… opens the same Relate view as the chart, for any kind of relation with anything, including a new kind.
  - The top bar switches between System, Light and Dark themes.
  - Changes are saved in the browser's local storage, with undo and redo.
- [mockups/Dappled Wall.html](<mockups/Dappled Wall.html>): tree-branch shadows on a wall, a candidate background for the loading screen.

## Code

The chart and record panel mockups share the code in [mockups/app/](mockups/app/). These are plain scripts loaded in order, with no build step.

| File | What it does |
| ---- | ------------ |
| `common.js` | Text helpers, icons, checkboxes, and the theme preference |
| `model.js` | The sample data; the state (records, entry order, styles, box positions) with undo and redo; reading the state; checking it against [data-model.md](../data-model.md) |
| `styles.js` | Styles: presets, the sample styles, and how styles combine into a box's or line's look |
| `panel.js` | The record panel |
| `relate.js` | The Relate view, for relating two things |
| `ribbon.js` | The chart's ribbon |
| `chart.js` | The chart: drawing boxes, routing lines, selecting, moving, editing in place, and relating by drag |
| `base.css`, `panel.css`, `chart.css` | Shared tokens and controls, the panel, and the chart page |

## Vendored assets

Third-party files under [vendor/](vendor/), downloaded from the jsDelivr npm CDN at pinned versions. Each folder has its project's license.

| Folder | Project | Version | License | What's here |
| ------ | ------- | ------- | ------- | ----------- |
| `vendor/tabler-icons/` | [Tabler Icons](https://tabler.io/icons) | 3.49.0 | MIT | 62 outline SVGs |
| `vendor/heroicons/` | [Heroicons](https://heroicons.com) | 2.2.0 | MIT | 35 outline SVGs (24px) |
| `vendor/inter/` | [Inter](https://rsms.me/inter/) via [Fontsource](https://fontsource.org) | 5.1.0 | OFL 1.1 | Variable font, Latin subset (woff2) |
| `vendor/tabler-core/` | [Tabler](https://tabler.io) UI kit | 1.7.1 | MIT | Component CSS and JS (Bootstrap-based); not used by the current mockups |
| `vendor/pico/` | [Pico CSS](https://picocss.com) | 2.1.1 | MIT | Classless CSS for quick mockups; not used by the current mockups |

The icons are a curated subset chosen with records in mind: kinds and objects (user, box, cube), fields and datatypes (letter-case, number, calendar, toggle), tags, drag handles (grip-vertical), relations (link, hierarchy, arrows-left-right), and panel controls (edit, plus, trash, chevrons, dots). The full sets are at the links above. Tabler's example HTML pages aren't in its npm package; browse them at https://preview.tabler.io.
