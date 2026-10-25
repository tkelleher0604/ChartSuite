# Presenting Rboreal

A guide to showing Rboreal to colleagues: how to set up, a ten-minute walkthrough, and honest answers to what they'll ask.

## Before you start

1. Open `app/index.html` in Chrome or Edge, from the repository folder or a copy of it. Nothing needs installing, and nothing leaves the computer.
2. If you've been trying things, put the sample back: **Settings › This chart › Reset to the sample**. Undo can bring your changes back.
3. Give your name when the welcome asks for it, so the history shows it beside your changes.
4. Pick the theme you'll present in (Light reads best on a projector), and make the window full screen (F11).
5. Keep the chart page in a second tab, so you can switch to it without waiting.

## The story in one sentence

*A fund legal team's whole record (entities, ownership, people, documents, deadlines) kept once, with everything else (charts, deadlines, what's missing, who controls whom) worked out from it, and every change on the record.*

## Ten minutes

| Minute | Show | Say |
| --- | --- | --- |
| 0–1 | **Home** | "This is what the team sees each morning: what's overdue, what's due in the next 30 days, what's missing, and who changed what." Point at the overdue Delaware tax: "Nobody typed that date. It's worked out from the entity's type and when the tax was last paid." |
| 1–3 | **Chart** | The Structure view, then Fund III and 40 Act (tabs along the bottom). Click a purple line on 40 Act: "Rboreal works out the BDC's close affiliates under Rule 57(b), and says why." Then **Present** and step through the views with the arrow keys. |
| 3–4 | **Export…** | PowerPoint for one view: "Native shapes, so it's editable in the deck, and drawn from the same data, so it's never out of date." Mention PDF. |
| 4–5 | **A record** (Ctrl+K, "Fund III") | Details on the left, relations, documents, dates and history on the right. Open a computed value's **Why**: "Every computed value says what it means and why it's there." **Export profile** gives a one-entity PDF. |
| 5–6 | **Records › Entities** | "It's a spreadsheet." Edit a cell, then paste a few rows from Excel; filter and sort. "Every edit is recorded, and every number that depends on it updates." |
| 6–7 | **Documents** | "SharePoint keeps the files; Rboreal knows what each one is and which entities it concerns." Show the preview pane (read live from the library), **Link document**, and the **Not linked** tab: "files in the library no record points to." |
| 7–8 | **Calendar** | Overdue, this week, next 30 days. **Export to Outlook** for the team's calendars. |
| 8–9 | **History** | Filter to Corvane: "Who changed its ownership, and when." Open an entry, show before and after, and **Restore this**: "nothing is ever erased; taking a change back is itself recorded." |
| 9–10 | **Schema** and **Settings** | The Schema: "the team's vocabulary, in plain words, with the rules that compute it." Settings: "the workbook can live in a SharePoint library, under SharePoint's own permissions and version history." Show **Have Margaret save it** to stage a conflict, and the three ways out. |

## What to say about it

- **One record, everything else follows.** Facts are entered once. Charts, deadlines, affiliate analyses and missing-document checks are worked out from them, like a spreadsheet's formulas, and say why.
- **A system of record.** Every change is kept, with who and when, and can be taken back without erasing anything. Required entries are flagged where they're missing.
- **SharePoint as the repository.** Rboreal indexes the library rather than replacing it: links, previews, reconciliation, and the workbook itself can live there, under the team's existing permissions.
- **No servers to run.** It's a set of pages that run in the browser. Sign-in, when connected, is the team's own Microsoft 365 sign-in.

## Questions you'll get

- **"Where is the data?"** In the browser by default; or in a file (a OneDrive or SharePoint-synced folder works); or in a SharePoint library through Microsoft Graph. There's no Rboreal server. Settings shows where it is.
- **"Who can see it?"** Whoever can open the file or the library: SharePoint's permissions decide. Role-based permissions inside Rboreal (viewer, editor, admin) aren't built yet.
- **"Can several people work on it?"** Yes, through a shared library: each save names the version it replaces, and if someone saved in between, nothing is lost. You choose to keep yours, take theirs, or save yours as a copy. It isn't live co-editing.
- **"Is it connected to our SharePoint?"** It's built and tested against Microsoft Graph's interface and a demo library. Connecting a real tenant takes an app registration by an administrator (docs/sharepoint-setup.md); that's the next step.
- **"Can it handle our hundreds of entities?"** The sample works out its 500 computed records in about 50 ms. The 40 Act affiliate rules compare every pair of persons, so they slow down with hundreds of entities; that part of the engine is being reworked.
- **"How is this different from Athennian or Diligent?"** They're mature entity-management products. Rboreal's bets are spreadsheet-speed editing, rules a lawyer can read and change (deadlines, affiliates, what's missing), fund structures (feeders, AIVs, blockers) as first-class, and the team's own SharePoint as the repository. See docs/domain-research.md §3.
- **"What can't it do yet?"** Repeated facts (several former names, several classes of interest between the same holder and entity), records as of a past date, in-app permissions, and holidays in deadline rules. docs/expressiveness.md has the full list, and the changes proposed for each.

## Asking for time

The ask is time to pilot it on a slice of real data. For example, one fund family's entities, documents and deadlines, in a SharePoint library the team already uses. Then measure what it saves: charts not redrawn, deadlines not missed, documents found.
