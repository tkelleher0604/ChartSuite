# Rboreal

Working name; the repository is called ChartSuite. Rboreal is a system of record for the legal team of a private fund manager, or any team that keeps track of entities. It works like a spreadsheet for corporate structure:

- It keeps the team's entities, people and investor groups.
- It keeps their ownership, control, positions and signing authority, and the registrations and documents that go with them.
- It draws structure charts from those records and exports them to PowerPoint and PDF.
- It works out by formula what follows from them: deadlines, control, affiliates, look-through ownership, what's missing.
- It records who changed what, and when.
- It's the index to the team's documents in SharePoint, so it can be the front end of the library.

## Trying it

Open [app/index.html](app/index.html) in a browser (Chrome or Edge). It needs no build step, server or sign-in. It opens with a sample: the fictional Calder Ridge fund complex, described in [docs/sample.md](docs/sample.md), with its documents in a demo SharePoint library that works offline.

The areas, in the sidebar:

| Area | What it's for |
| --- | --- |
| Home | What needs attention, recent changes, what's coming up |
| Chart | The structure chart, in views; Export… and Present |
| Documents | The index to the library: link, upload, preview, reconcile |
| Calendar | Every date, entered or worked out, as an agenda; export to Outlook |
| History | Every change, who made it, and when; take one back |
| Records | A table per kind, edited like a spreadsheet; paste from Excel |
| Schema | The chart's vocabulary: what each thing means and how it's worked out |
| Settings | Your name, the theme, and where the workbook is kept (this browser, a file, or a SharePoint library) |

Ctrl+K searches everything and runs any command. ? lists the keyboard shortcuts.

## How it's made

- **[PRODUCT.md](PRODUCT.md)**: what the app is and how it's built.
- **[data-model.md](data-model.md)**: the data model's core, records as labeled trees.
- **[model.html](model.html)**: the whole model as the app keeps it, with live figures.
- **[formulas.md](formulas.md)**: the formula language.
- **[app/README.md](app/README.md)**: the app, page by page and file by file.
- **[docs/](docs/)**:
  - [design.md](docs/design.md): the design system;
  - [ui-research.md](docs/ui-research.md) and [domain-research.md](docs/domain-research.md): the research behind it;
  - [sample.md](docs/sample.md): the sample;
  - [presenting.md](docs/presenting.md): how to show it, in ten minutes;
  - [expressiveness.md](docs/expressiveness.md): what the model can and can't yet record;
  - [sharepoint-setup.md](docs/sharepoint-setup.md): connecting a real SharePoint library;
  - [qa/](docs/qa/): the reviews it was tested against.

Everything runs in the browser from plain files, with no server of its own. The tests are pages in [app/tests/](app/tests/): open one to run it.
