# UI

Working area for Rboreal's frontend design.

## Mockups

Open these directly in a browser.

- [mockups/record-panel.html](mockups/record-panel.html): the path-only record panel, with adding, editing and deleting entries. It checks each change against the state and schema conditions in [data-model.md](../data-model.md). Changes are saved in the browser's local storage.
- [mockups/Dappled Wall.html](<mockups/Dappled Wall.html>): tree-branch shadows on a wall, a candidate background for the loading screen.

## Vendored assets

Third-party files under [vendor/](vendor/), downloaded from the jsDelivr npm CDN at pinned versions. Each folder has its project's license.

| Folder | Project | Version | License | What's here |
| ------ | ------- | ------- | ------- | ----------- |
| `vendor/tabler-icons/` | [Tabler Icons](https://tabler.io/icons) | 3.49.0 | MIT | 61 outline SVGs |
| `vendor/heroicons/` | [Heroicons](https://heroicons.com) | 2.2.0 | MIT | 35 outline SVGs (24px) |
| `vendor/tabler-core/` | [Tabler](https://tabler.io) UI kit | 1.7.1 | MIT | Component CSS and JS (Bootstrap-based) |
| `vendor/pico/` | [Pico CSS](https://picocss.com) | 2.1.1 | MIT | Classless CSS for quick mockups |

The icons are a curated subset chosen with records in mind: kinds and objects (user, box, cube), fields and datatypes (letter-case, number, calendar, toggle), tags, relations (link, hierarchy, arrows-left-right), and panel controls (edit, plus, trash, chevrons, dots). The full sets are at the links above. Tabler's example HTML pages aren't in its npm package; browse them at https://preview.tabler.io.
