# Dendra

Excel for structure charts: a system of record for anything that's a chart of who stands to whom, a company's entities, a manager's org chart, a family's tree, a private fund's whole legal structure. It works out by formula what follows from what's recorded, and draws charts that export to PowerPoint and PDF. Each begins from a template: [app/templates](app/templates).

- [dendra.md](dendra.md): the design, built up from [data-model.md](data-model.md).
- [formulas.md](formulas.md): the formula language.
- [docs/chart-builder-review.md](docs/chart-builder-review.md): blank-chart and reusable-design workflow, GUI acceptance checks, and the kinds/choices decision.

Open `app/index.html` in Chrome or Edge. It needs no server, build step or sign-in.

For AI agents keeping a fund's records in a workbook: [skills/dendra](skills/dendra/SKILL.md), a skill with a tool that records plans in the chart's own words with Dendra's core.
