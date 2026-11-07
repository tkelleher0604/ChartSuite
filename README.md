# Dendra

Excel for structure charts: a system of record for anything that's a chart of who stands to whom, a company's entities, a manager's org chart, a family's tree, a private fund's whole legal structure. It works out by formula what follows from what's recorded, and draws charts that export to PowerPoint and PDF. Each begins from a template: [app/templates](app/templates).

- [dendra.md](dendra.md): the design, built up from [data-model.md](data-model.md).
- [formulas.md](formulas.md): the formula language.
- [docs/chart-builder-review.md](docs/chart-builder-review.md): blank-chart and reusable-design workflow, GUI acceptance checks, and the kinds/choices decision.
- [docs/scoped-canvas-model.md](docs/scoped-canvas-model.md): selection, scope, graphical structure, inline bindings, and record-write semantics.

Open `app/index.html` in Chrome or Edge. It needs no server, build step or sign-in.

Run the browser checks on Windows with:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File app/tests/run.ps1
```

The runner uses an installed Chrome or Edge, an isolated profile for each suite, and a temporary loopback server. It waits for completed test reports using real browser time, then saves a screenshot, DOM, browser log and `results.json` in the printed temporary directory. Failed checks and incomplete suites return a nonzero exit code. No packages or browser debugging connection are required. For a focused run:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -Command "& ./app/tests/run.ps1 -Suite builder,store"
```

`-Browser` selects an executable; `-Artifacts` selects the output directory. Each suite has up to ten minutes to finish (`-TimeoutSeconds` changes this). Use `-Width 1024 -Height 900` or `-Theme dark` for alternate editor presentations. `-Suite design-editor -Stop palette` and `-Suite canvas-text -Stop paragraph` capture those workflows at reviewable intermediate states.

The `builder` suite covers blank charts and drawing-to-type creation; `design-editor` covers fields, scopes, design forks, free arrangements and growing text; `canvas-text` covers mixed paragraphs and live scoped record editing; `field-extraction-gui` covers selected text becoming a named record field; `classification-gui` covers choice-based fields and independent category designs. The same flows open in `app/tests/builder-test.html?flow=design-editor` (or `canvas-text`, `field-extraction`, `classification`). Smaller `bound-text`, `edit-scope`, `put-batch`, `words` and `field-extraction` suites check their contracts. The inspector uses `?run`, the separate canvas-entry checks use `?entering`, and the formula editor uses `?checks` and `?rules`. Browser authoring tests drive visible controls with scripted DOM events. Human interaction and native Office review remain separate checks.

For AI agents keeping a fund's records in a workbook: [skills/dendra](skills/dendra/SKILL.md), a skill with a tool that records plans in the chart's own words with Dendra's core.
