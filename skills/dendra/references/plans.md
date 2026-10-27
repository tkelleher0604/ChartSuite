# Plans

A plan is a JSON file of records to put in a chart, written in the chart's own words (`vocab` lists them). `apply` finds each record if the chart has it, or adds it, then sets its entries. So a plan says what should be true, and running it twice records it once.

## Contents
- [The plan](#the-plan)
- [Objects](#objects)
- [Entries](#entries)
- [Relations](#relations)
- [A record by its id](#a-record-by-its-id)
- [Days: what changed when](#days-what-changed-when)
- [Ending, removing, correcting](#ending-removing-correcting)
- [New labels, options and kinds](#new-labels-options-and-kinds)
- [Overrides](#overrides)
- [What apply says](#what-apply-says)
- [Worked examples](#worked-examples)

## The plan

```json
{
  "chart": "Calder Ridge Fund III structure",
  "who": "Claude, for Jordan Alvarez",
  "day": "2026-06-30",
  "records": [ … ]
}
```

- `chart` is the chart's name. Leave it out when the workbook has one chart.
- `who` is required. History shows it beside every change. Name yourself and the person you work for.
- `day` (optional) is the day these facts became true in the world, for every record that doesn't give its own; see [Days](#days-what-changed-when).
- `records` is a list. Each is an object, a relation, or a record by its id. They're recorded in order, so add a thing before you relate it.

## Objects

```json
{ "kind": "Entity", "entries": { "Name": "Calder Ridge Capital GP IV, LLC", "Short Name": "GP IV", … } }
```

- `kind` is one of the chart's kinds: Entity, Individual, Investor Group, Document, Tax Year, Service Provider in the sample.
- **Finding:** the object is found by its `Name` among objects of that kind, or failing that by its Short Name. If none matches, a new object is added.
  - The name used to find an object is never written onto it.
  - To rename an object, give its `id` with the new Name: `{ "id": "mvq…", "kind": "Entity", "entries": { "Name": "New name" } }`.
- Two objects of a kind with one name are refused as ambiguous. Give the one you mean by `id`; `show --find` lists ids.

## Entries

`entries` maps a label to what it records. What a label takes is the chart's (`vocab` says), and the value is read accordingly:

| The label takes | Write | Examples |
| --- | --- | --- |
| text | a string | `"EIN": "92-4810337"` |
| a date | a string, best as ISO | `"Formation Date": "2026-03-02"` (or `"March 2, 2026"`) |
| a day of the year | a string | `"Fiscal Year End": "December 31"` |
| a percentage | a string **with its sign** | `"Percentage": "71.6%"` |
| money | a string or a number | `"Target Commitments": "$750,000,000"` |
| a number | a number or a string | `"Beneficial Owners": 212` |
| a document | its address | `"Link": "https://firm.sharepoint.com/sites/Legal/…/LPA.pdf"` |
| a checkbox | `true` or `false` | `"Good Standing": true` |
| one of some options | the option, as `vocab` spells it (case doesn't matter) | `"Entity Type": "Limited Partnership"` |

**Entries at an entry.** Where an entry has its own entries (a File Number at a Jurisdiction, an LEI at LEI Registered), give `value` and `entries`:

```json
"Jurisdiction": { "value": "Delaware", "entries": { "File Number": "7801456" } },
"LEI Registered": { "value": true, "entries": { "LEI": "549300ABCDEF12345678", "Registered On": "2026-03-10" } }
```

- **Only the inner entries:** when the outer entry is already there, `"LEI Registered": { "entries": { "Last Renewed": "2027-03-01" } }` sets just those.
- **Removing:** `null` removes an entry (`"Short Name": null`). On a day, it ends there instead.
- **Its own period:** `since` and `before` (ISO days) beside `value` give an entry its own period, for history recorded in one go. Prefer [days](#days-what-changed-when), which split a record's history for you.

## Relations

```json
{ "relation": "Ownership", "sides": { "Owner": "Calder Ridge Capital GP IV, LLC", "Owned": "Fund IV" },
  "entries": { "Percentage": "1%" } }
```

- **Name and sides:** `relation` is its name as `vocab` gives it. `sides` names each of its edges' objects by Name or Short Name; all are needed.
- **Found or added:** a relation is found by its sides, or else added.
- **Its value:** a relation that's one of some options says which in `value`. A Position is `"Director"`, `"Officer"` or `"Employee"`; a Membership is `"Managing Member"` or `"Member"`. One that only holds needs no value.
- **Sides that stand at an entry.** Some relations stand not at an object but at one of its entries:
  - a General Partner's Partnership, at the partnership's Entity Type (Limited Partnership or Exempted Limited Partnership);
  - a Membership's LLC, at its Entity Type (Limited Liability Company);
  - a Registered Agent's Principal, at its Jurisdiction;
  - an Annual Tax's Taxpayer, at its Jurisdiction (Delaware).

  Name the object all the same; the tool places the side. If the object hasn't the entry the relation needs (a general partner of an LLC, say), the tool refuses and says what each side is.
- **A side that is itself a relation**, as what a document evidences (a Position, a Signing Authority), is given by id: `"Evidenced": { "id": "mvq…" }`.

## A record by its id

`{ "id": "…", "entries": { … } }` sets entries at any record `show` lists: an object, a relation or an entry. `{ "id": "…", "value": … }` sets its own value.

## Days: what changed when

The chart is read as of a day. Every record holds over a period. A plan's records take no day unless they say so; with a day, they're a change in the world on that day.

- **No day:** what was so all along, from when the thing began, or a correction of a mistake.
  - Adding: the record holds for as long as what it's at does. An entity holds from its Formation Date.
  - Setting: replaces the value outright, as if it had always been so.
  - Most first recordings take no day: an entity formed in 2023 holds from its Formation Date whatever day you record it on.
- **A day** (`"day"` on the record, or on the plan for all): something changed on that date.
  - Adding: the record holds from that day.
  - Setting: the old value stays true before the day and the new one holds from it.
  - Removing: the record ends that day.
- **One change per day:** records in a row with one day make one change. A plan can record a sequence of events in date order (records with their own days), and History shows each as its own change.

Dates that bound a record are entries, not days. `vocab` marks them "starts it" or "ends it":
- Formation Date and Dissolution Date (an entity);
- Admission Date and Withdrawal Date (a general partner);
- Start Date and End Date (a position, and Start Date for a signing authority).

Record those as the documents give them.

## Ending, removing, correcting

- **Something ended:** record its end date if it has one (Dissolution Date, End Date, Withdrawal Date). Otherwise remove it on its day: `{ "relation": "Investment Adviser", "sides": {…}, "remove": true, "day": "2026-09-30" }`. The chart as of earlier days still shows it.
- **A mistake:** `"remove": true` with no day deletes the record and everything at it, as if never made. The dry run lists all it takes. It's in History, and Restore brings it back, but treat it as a correction of the record, not a fact.
- **A wrong value:** set it with no day; History keeps what it was.
- **An object:** `{ "kind": "Entity", "entries": { "Name": "…" }, "remove": true }`.

## New labels, options and kinds

The chart's words are the firm's, so prefer them. When the person agrees the chart needs something new:

- **A new entry:** `"Registered Office": { "value": "…", "new": "text" }`. `new` names what it takes: text, number, percent, money, date, yearly, document, choice or tag.
- **A new option:** `"Vehicle Type": { "value": "Continuation Fund", "new": true }`.
- **A new kind:** `{ "kind": "Trust", "new": true, "entries": { … } }`.

Without `new`, an unknown label or option is refused with the chart's own and the nearest ("Did you mean “Jurisdiction”?"). That's how misspellings are caught.

## Overrides

What a formula works out is Dendra's: every "… Due" date, Control, Affiliated Person, Voting Percentage, Tax Classification, the checks. The tool refuses to enter it.

An entry can stand over its formula: a tax classification election, or a voting percentage a side letter sets. For that, say `"override": true`. The window marks such an entry with an amber corner, and `check` lists it. Use it only for what a document says, and say so in your summary.

## What apply says

- **Changes:** each change by its day. `+` is added, with what's added at it beneath; `~` is changed, with what it was; `−` is removed or ended.
- **Worked out:** what the formulas now give that they didn't, by definition.
- **Needs attention now:** the status bar's counts after the change, and each item that's new. For example:
  - "Fund IV: Formation Document on File fails" means no filed certificate is linked.
  - "Ownership Adds Up fails" means the owners recorded don't hold 100%.
- **Overrides:** entries now standing over a formula.

A refusal names the record, by its place in the list, and what's wrong; nothing is written. Fix the plan and run it again.

## Worked examples

**A Delaware LP, its GP and its formation certificate:**

```json
{ "who": "Claude, for Jordan Alvarez", "records": [
  { "kind": "Entity", "entries": { "Name": "Calder Ridge Capital GP IV, LLC", "Short Name": "GP IV",
      "Formation Date": "2026-02-20", "Jurisdiction": { "value": "Delaware", "entries": { "File Number": "7798120" } },
      "Entity Type": "Limited Liability Company", "Vehicle Type": "General Partner", "Good Standing": true } },
  { "kind": "Entity", "entries": { "Name": "Calder Ridge Capital Partners IV, L.P.", "Short Name": "Fund IV",
      "Formation Date": "2026-03-02", "Jurisdiction": { "value": "Delaware", "entries": { "File Number": "7801456" } },
      "Entity Type": "Limited Partnership", "Vehicle Type": "Main Fund", "Investment Company Status": "3(c)(7) Fund",
      "Fiscal Year End": "December 31", "Good Standing": true } },
  { "relation": "General Partner", "sides": { "GP": "GP IV", "Partnership": "Fund IV" }, "entries": { "Admission Date": "2026-03-02" } },
  { "relation": "Ownership", "sides": { "Owner": "GP IV", "Owned": "Fund IV" }, "entries": { "Percentage": "1%" } },
  { "relation": "Membership", "sides": { "Member": "Margaret A. Chen", "LLC": "GP IV" }, "value": "Managing Member" },
  { "kind": "Document", "entries": { "Name": "Certificate of Limited Partnership, Calder Ridge Capital Partners IV, L.P.",
      "Document Type": "Certificate of Limited Partnership", "Document Date": "2026-03-02", "Status": "Filed",
      "Link": "https://calderridge.sharepoint.com/sites/Legal/Fund%20IV/Formation/Certificate%20of%20LP.pdf" } },
  { "relation": "Concerns", "sides": { "Document": "Certificate of Limited Partnership, Calder Ridge Capital Partners IV, L.P.", "Subject": "Fund IV" } }
] }
```

**An officer, and who signs for the fund:**

```json
{ "who": "Claude, for Jordan Alvarez", "records": [
  { "kind": "Individual", "entries": { "Name": "Elena V. Sorensen", "U.S. Person": true } },
  { "relation": "Position", "sides": { "Holder": "Elena V. Sorensen", "Company": "GP IV" }, "value": "Officer",
    "entries": { "Title": "Chief Financial Officer", "Start Date": "2026-03-02" } },
  { "relation": "Signing Authority", "sides": { "Signatory": "Margaret A. Chen", "Via": "GP IV", "On Behalf Of": "Fund IV" },
    "entries": { "Capacity": "Managing Member", "Start Date": "2026-03-02" } }
] }
```

Capacity Held is worked out: Dendra checks that the signatory holds that capacity at the entity signed through. A failure is an error in `check`.

**A payment, a filing, and a closing on a date:**

```json
{ "who": "Claude, for Rebecca A. Moretti", "records": [
  { "relation": "Annual Tax", "sides": { "Taxpayer": "Fund III", "Tax Year": "2025" }, "entries": { "Annual Tax Paid": "2026-05-28" } },
  { "kind": "Entity", "entries": { "Name": "Fund III", "LEI Registered": { "entries": { "Last Renewed": "2026-09-20" } } } },
  { "relation": "Ownership", "sides": { "Owner": "GP IV", "Owned": "Fund IV" }, "entries": { "Percentage": "0.5%" }, "day": "2026-06-30" }
] }
```

- **The payment:** the Annual Tax for a taxpayer and a tax year is worked out. Its payment is recorded at it as Annual Tax Paid, which settles that year's Annual Tax Due. A Tax Year object (Name "2026", Year 2026) must exist; add one if `show` has none.
- **The filing:** record what was filed and when (Last Renewed, Last Filed, Last Annual Amendment), never the next due date.
- **The closing:** a percentage that changed on a day.
