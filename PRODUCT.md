# Rboreal: the production app

What we're building, and how. This is the plan the build follows. [model.html](model.html) is the data model it rests on.

## What it is

A system of record for the legal team of a private fund manager, or any team that keeps track of entities. It holds:
- their entities, people and investor groups;
- ownership, control and the other relations between them;
- officers, signatories and registrations;
- the deadlines that follow from all these;
- the documents that evidence them, kept in SharePoint and indexed here.

It draws structure charts from these records and exports them to PowerPoint and PDF. It works out what follows from them by formula, such as control, affiliated persons, look-through ownership and due dates. And it records who changed what, and when.

The aim is a spreadsheet's directness, applied to the structures a fund lawyer works with: every fact entered once, everything else following from it.

## Who it's for

- Lawyers and paralegals who maintain the records and answer questions from them. For example: "Who can sign for the AIV?", "What's due in March?", "Is the blocker a close affiliate of the BDC?"
- Colleagues who need a chart, a list or a document, and need to trust that it's current.

## The app

One page, [app/index.html](app/index.html). It needs no server and no build step, and runs from a file or any static host.

| Area | What it shows |
| --- | --- |
| **Home** | Upcoming deadlines, recent changes, what's missing or in error, and a way into everything else |
| **Chart** | The structure chart, in views: tabs, a toolbar, styles and filters. Export to PowerPoint (native, editable shapes), PDF and SVG |
| **Records** | A table for each kind (Entities, Individuals, Documents, …): columns for its entries, inline editing, sorting, filtering, and adding rows |
| **Record** | One record: its entries, its relations grouped by list name, its documents, its dates, its history, and why each computed value is what it is. Export a profile to PDF |
| **Documents** | Every document the chart links to: by entity, type and date, with where it is in SharePoint. Link a new one by browsing the library |
| **Calendar** | Every date in the chart, entered or computed, as upcoming, overdue and past. Export to Outlook (.ics) |
| **Schema** | The chart's vocabulary by form: names, definitions, required entries, styles |
| **History** | Every change to the data: what, who and when, filterable, and per record |
| **Settings** | Your name, where the workbook is kept, the SharePoint connection, the theme |

These run across all of them:
- **Search and commands.** The command palette (Ctrl+K) finds any record, opens any area, and runs any action.
- **Undo and redo.** Every edit is undoable.
- **Charts.** A workbook holds several charts (structures), and the chart menu switches between them.

## Architecture

- **The core** (`app/core/`) has no page code in it:
  - the model (model.html), with the schema, records, definitions, names, views, history and workbook;
  - the formula engine (formulas.md);
  - styles;
  - storage;
  - the SharePoint connector;
  - exports;
  - the sample workbook.
- **The UI** (`app/ui/`): one file per area, plus the shell (navigation, palette, toasts, dialogs) and shared components.
- **The look** (`app/css/`): design tokens and components. There's one design system, and both light and dark themes are first-class.
- **Third-party code** (`vendor/`): pinned and licensed. KaTeX, PptxGenJS, jsPDF with svg2pdf, MSAL and Inter.
- **Tests** (`app/tests/`): the model's invariants, the formula engine's claims, the SharePoint connector, and the exports.

### Where the data lives

A workbook (its charts, each with its data, views and history) is one JSON document. The app keeps it in one of three places:
1. **This browser.** The default, which needs no setup.
2. **A file.** Open and save, including in a folder that OneDrive or SharePoint syncs.
3. **A SharePoint library,** through Microsoft Graph. This is how a team shares one system of record:
   - SharePoint's permissions decide who may read and edit it;
   - its version history keeps every saved version;
   - a save that would overwrite someone else's newer one is refused and offered for review, rather than lost.

There's no server of our own to run. Signing in is the team's own Microsoft 365 sign-in (MSAL); the app never sees a password.

### Documents

A *document* is a field whose value is an address: a SharePoint or OneDrive file, a DMS link, an EDGAR filing or a network path. The sample keeps documents as objects of the kind Document, each with:
- its link;
- its type and date;
- whether it's executed;
- a *Concerns* relation to the entities it's about.

The Documents area indexes every document the chart has. With SharePoint connected, a document can be linked by browsing or searching the library, and its name, version and last change are read from it. A demo library stands in when nothing is connected, so the app can be shown offline.

### Exports

Everything happens in the browser:
- **The chart as PowerPoint,** as native shapes, so a chart stays editable in the deck.
- **The chart as a vector PDF,** with a title block.
- **An entity profile as PDF.**
- **Tables as CSV, and the calendar as .ics.**
- **The workbook as JSON.**

## How it's built

In waves, each tested before the next:
1. **Research and spikes:**
   - great UIs to learn from;
   - what a fund legal team needs;
   - how much the model can express;
   - export;
   - SharePoint.
2. **The shell and design system,** then the areas in parallel, on shared components.
3. **The sample:** a realistic fictional fund complex, with documents in the demo SharePoint library and deadlines by formula.
4. **QA, and a critique of design and ease of use;** expressiveness tested again; fixes.
5. **Packaging to present:** a short guided tour, and a guide to showing it.
