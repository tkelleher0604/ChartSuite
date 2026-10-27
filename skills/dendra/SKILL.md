---
name: dendra
description: Record a fund's corporate structure in a Dendra workbook (.dendra.json). Covers entities, people and investor groups; ownership percentages, general partners, LLC members, officers, directors, signing authority, advisers and registered agents; registrations, filings, payments and documents. Sources can be formation documents, LPAs, org charts, spreadsheets or what a person tells you. Use this whenever someone wants a fund, fund complex, management company or any group of entities entered, updated or checked in Dendra, or hands you a .dendra.json file. That includes short asks like "add the new feeder to our chart", "log that we paid the Delaware tax", "who signs for Fund III?" or "what's overdue?".
---

# Recording a fund in Dendra

Dendra is a legal team's system of record for corporate structure charts: the app in this repository (`app/`), also served at https://tkelleher0604.github.io/ChartSuite/app/.

A workbook is one file, `<name>.dendra.json`. It holds a log of changes, each signed by who made it and when. Nothing in it is ever overwritten: History lists every change, and any change can be undone.

You record facts by adding changes to that log with the bundled tool. The tool runs Dendra's own core, so what you write is exactly what the app reads. It also refuses what the app would quietly take but a lawyer would not: a misspelt entry, an option that doesn't exist, a general partner of an LLC.

What you record becomes the firm's record. Its charts go to boards, regulators and counterparties. So the work is careful transcription, not inference. The rules below exist because each one, broken, puts something false or unprovable into that record.

## The tool

Run it with Node if there is one, or else with the same tool in headless Chrome or Edge:

```
node <skill>/scripts/dendra.js <command> …     # Node 18 or later
sh   <skill>/scripts/dendra.sh <command> …     # no Node: uses Chrome or Edge
```

| Command | What it does |
| --- | --- |
| `vocab <workbook>` | What can be recorded in the chart, in its own words: kinds, entries, options, relations. It marks what Dendra works out itself, what's required, and which dates start or end a record. |
| `show <workbook> [--find <name>]` | The records. With no `--find`, every object with its id; with it, those objects in full, with their relations. |
| `check <workbook> [--day <date>]` | What needs attention, counted as Dendra's status bar counts it (overdue, errors, due soon, blank), each item in words. Also entries that stand over a formula, and disagreements. |
| `apply <workbook> <plan.json> [--write]` | Records a plan. Without `--write` it only says what it would record, what Dendra would then work out, and what would newly need attention. |
| `new <workbook> --name <chart> --who <name>` | Begins a chart with no records, from the sample's schema, definitions, checks and views (or `--template <workbook>`). Its file is created if it doesn't exist. |

Give `--chart <name>` when a workbook has more than one chart.

The scripts find Dendra's core at `../../../app` (the repository). Installed elsewhere, give `--app` either:
- Dendra's `app/` folder; or
- the address of the published app, `https://tkelleher0604.github.io/ChartSuite/app`. The tool then runs the core it fetches from there.

## How to do it

1. **Get the workbook.** Dendra keeps a workbook in the browser until someone saves it to a file. Ask the person to use the chart menu (the name at the top left) → **Save as…**, and tell you where it is.
   - Once saved, Dendra keeps that file in step: it writes there after each change, and when its tab is next in front it takes in changes made to the file elsewhere, yours included.
   - For a new fund complex with no workbook yet, `new` begins one. The person opens it in Dendra with **Open…** (Ctrl+O).
   - Don't edit the JSON by hand: the log has invariants the core enforces, and a hand edit can break them.
2. **Learn the chart's words.** Run `vocab` on the workbook every time, before anything else. Each firm's chart has its own kinds, entries and options, and only those can be recorded without saying they're new.
   - [references/vocabulary.md](references/vocabulary.md) is the sample's vocabulary, for orientation when you have no workbook yet.
   - Run `show` to see what's already there, so you change existing records rather than duplicate them.
3. **Read the sources, and list what they say.** For each fact, note the document and the date it speaks as of.
   - [references/funds.md](references/funds.md) says how the usual fund documents map to Dendra's records. It covers the certificate of limited partnership, the LPA, the operating agreement, an incumbency certificate, cap tables, filings and payments.
   - Where the sources are silent, contradict each other, or need judgment (is this a correction or a change on a date?), write the question down. Ask the person before you record that fact. Leave the rest of the plan to go ahead.
4. **Write the plan, and dry-run it.** [references/plans.md](references/plans.md) gives the format. Run `apply` without `--write`.
   - If it refuses, read why, fix the plan, and run it again. Plans are idempotent: what the chart already says is left alone, so rerunning a corrected plan doesn't duplicate anything.
   - Read the dry run's "needs attention" part. A new error usually means something missing: a formation document, or owners that don't add up to 100%. Fill it from the sources if they have it. If they don't, report it; don't paper over it.
5. **Show the person what will be recorded, then write.** Give them the dry run's summary, or the part that matters, and your open questions. Write with `--write` once they agree.
   - For a first recording, or anything that changes what a chart already says, always wait for that agreement.
   - Small additions they've plainly asked for ("log that we paid the 2025 tax on May 28") can go straight through. Then say what you recorded.
6. **Check, and hand back.** Run `check` and compare it with what you expected. Then tell the person:
   - what you recorded;
   - what Dendra now flags, and why;
   - what's still open;
   - how to see it: switch to Dendra's tab, or Open… the file. Their own changes and yours meet without loss, as Dendra merges logs.

## What matters, and why

- **Record only what a source says.** A blank is honest: Dendra counts a blank required entry, so someone sees it and fills it. A guess looks exactly like a fact, and nobody will ever check it. If you infer something (a GP's admission date from the LPA's date, say), say so in your summary and let the person decide.
- **Never enter what Dendra works out.** The tool refuses these unless you say `"override": true`:
  - deadlines ("… Due");
  - affiliations, control, look-through ownership and Voting Percentage;
  - Tax Classification;
  - the checks (Ownership Adds Up, the "on file" checks, Capacity Held).

  Entering a deadline would freeze it: paying the tax would no longer move it on. Record what the formulas read instead: the date something was filed or paid, the fiscal year end, the percentages. Override only for something that truly stands over the formula, like a tax classification election, and say so.
- **Time has two kinds of change.**
  - What was so from the start, or a correction of a mistake, takes no day.
  - A change in the world on a date takes that day (a GP replaced, a percentage changed at a closing, an entity's good standing lost, and every payment or filing, as Dendra's own Paid… and Filed… record them). The old value then stays true before that day and the new one from it, so the chart as of any past date stays right.
  - Dates that bound a record are entries, not days: Formation Date starts an entity and Dissolution Date ends it. Likewise Admission and Withdrawal Date for a GP, and Start and End Date for a position. `vocab` marks them "starts it" and "ends it".
- **End what ended; delete only mistakes.** A dissolved entity gets its Dissolution Date. A resigned officer gets an End Date. Removing without a day deletes, as if it had never been. That's right only for a record made in error.
- **Names exactly as the documents give them.** Use the full legal name, with its punctuation ("Calder Ridge Capital Partners IV, L.P.").
  - **Short Names:** give one ("Fund IV") only where the documents or the person use it. A folder name or an abbreviation you'd coin isn't a name; list it as a suggestion instead.
  - **Duplicates:** the plan finds existing objects by Name or Short Name, so a near-miss name creates a duplicate. When `apply` says "There's no Entity named…", check `show` before you add one.
- **Every document you rely on is a Document**, with its Link (a SharePoint or file address the firm can open), type, date and status, and related by Concerns to what it's about. That makes the record provable. It's also what the "on file" checks look for.
- **Sign your changes** with `"who": "Claude, for <the person you're working for>"`. History shows it to everyone who opens the workbook.
- **Percentages are text with their sign** ("71.6%"; a fraction would be ambiguous). Money can be "$750,000,000" or a number. Dates are best as 2026-03-02.

## A small plan

```json
{
  "who": "Claude, for Jordan Alvarez",
  "records": [
    { "kind": "Entity", "entries": {
        "Name": "Calder Ridge Capital Partners IV, L.P.", "Short Name": "Fund IV",
        "Formation Date": "2026-03-02",
        "Jurisdiction": { "value": "Delaware", "entries": { "File Number": "7801456" } },
        "Entity Type": "Limited Partnership", "Vehicle Type": "Main Fund" } },
    { "relation": "General Partner", "sides": { "GP": "Calder Ridge Capital GP IV, LLC", "Partnership": "Fund IV" },
      "entries": { "Admission Date": "2026-03-02" } },
    { "relation": "Ownership", "sides": { "Owner": "Calder Ridge Capital GP IV, LLC", "Owned": "Fund IV" },
      "entries": { "Percentage": "1%" } },
    { "kind": "Entity", "entries": { "Name": "Fund III", "Good Standing": false }, "day": "2026-10-01" }
  ]
}
```

Each record is an object (`kind`), a relation (`relation` and its `sides`), or an existing record by its `id`. Each has `entries` keyed by the chart's labels, nested where an entry sits at another (a File Number at its Jurisdiction). See [references/plans.md](references/plans.md) for the rest:
- removing and ending records;
- relations that stand at an entry, like a general partner at a partnership's Entity Type;
- payments at a tax year;
- new labels and options;
- overrides.
