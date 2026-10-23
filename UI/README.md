# UI

Working area for Rboreal's frontend design.

## Mockups

Open these directly in a browser.

- [mockups/record-panel.html](mockups/record-panel.html): the record panel, with adding, editing, deleting and reordering entries, and a first pass at relations.
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
  - New relations can be added to the kinds already in the state, from the Add menu or a relation row's "+". Defining new kinds of relation isn't built yet.
  - The top bar switches between System, Light and Dark themes.
  - Changes are saved in the browser's local storage.
- [mockups/Dappled Wall.html](<mockups/Dappled Wall.html>): tree-branch shadows on a wall, a candidate background for the loading screen.

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
