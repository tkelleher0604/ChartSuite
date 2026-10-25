# What Rboreal can record: a fund legal team's facts

*Tested October 25, 2026, against the model as it stands in [data-model.md](../data-model.md), [model.html](../model.html) and [formulas.md](../formulas.md), with [app/tests/expressiveness-test.html](../app/tests/expressiveness-test.html). Everything in the test is fictional.*

## Summary

The test records every fact in [domain-research.md](domain-research.md) §1 and §5 in a fresh chart, using the model's own functions. §5 is the fictional Quillhaven complex: 14 entities, 6 people, 16 investor groups, 48 interests and 30 documents. The test then checks 123 things about what the chart holds and what its formulas compute, and all 123 pass. Of the 62 facts, 47 record cleanly, 11 awkwardly, and 4 can't be recorded as they are.

**What the model does well**
- **Facts are computed from where they belong.**
  - Each interest's percentage comes from its commitment.
  - Ownership comes from the interests in effect.
  - Control comes from votes, general partner interests and managing-member offices.
  - Look-through ownership is followed through three levels.
  - §5's signature block ("Fund III, by its GP, by its Managing Member") comes out character for character.
- **Rules can be data.**
  - A deadline rule is a Rule object holding its anchor, its offset, its weekend handling and the document type that meets it. One computed relation, Deadline (Entity, Rule), applies every rule to every entity.
  - This reproduces §5's whole compliance calendar, entity by entity. That includes weekend roll-forward and roll-back, leap years, Delaware's $400 tax, and "not applicable" for the closed Form D offerings and FinCEN BOI.
  - Required documents work the same way. The missing-documents report matches §5's deliberate gaps exactly.
- **Where a record is located decides how many there can be.** A registered agent located at the entity's Jurisdiction choice can serve one entity in two jurisdictions. A CRD number located under the SEC registration belongs to that registration.
- **Entered records win, and keep their place.** A last filing or a responsible person entered at a computed deadline stays put while the deadline is worked out again.

**The three most important gaps**
1. **Repeated facts.** A record is one per argumentation, and only objects repeat. So none of these can be an entry or a relation:
   - two interests one holder has in one entity;
   - a second former name;
   - a re-appointment to an office held before;
   - one occurrence of a recurring deadline.

   Each has to be an object of its own instead. It needs a made-up Name, it is related by hand to what it belongs to, and it is left behind when that thing is deleted.
2. **Time.** Nothing in the model has an effective date except through fields.
   - Showing the chart "as of" a past date needs an entered As Of record that every dated formula reads.
   - Entered relations don't respond to it.
   - Export's "As of" only prints a date.
3. **Documents as evidence for relations.** A formula reads a relation's argument as BLANK when that argument is located at another relation, such as a tenure or a deadline. So two links can't be computed or read:
   - from a deadline to the filing that met it;
   - from a document to the appointments it made.

**Recommended changes, in order**
1. **Let an object have locations** (model). A specification's root may be a kind. Such records repeat the way objects already do, belong to their locations, and need no Name.
2. **Make TODAY() the chart's as-of date** (formula language). The session sets it, and so does Export. ASOF(date, expression) reads another date.
3. **Let a relation's argument located at a relation mean that relation** (formula language).

After those: holidays in WORKDAY, deadlines and checks marked in the Schema view, money in a currency, and a month-and-day datatype. The test also found three bugs in the app (see [Bugs found in the app](#bugs-found-in-the-app)).

## How the test works

- **Building the chart.**
  - The page loads the core scripts, as [model-test.html](../app/tests/model-test.html) does, and starts a workbook with one blank chart.
  - It enters records through `commit`, and definitions and relation names through `changeFormulas`, a batch at a time.
  - It ends with 1,350 entered records, 737 computed records, 287 specifications and 33 definitions, and runs in about 5 seconds in headless Chrome.
- **Checks.**
  - Each fact is checked as recorded: what the chart holds, and what its formulas compute. Expressions are worked out at records with `Formulas.evaluateAt`.
  - Where the direct way of recording a fact is refused, the check confirms the refusal and quotes the model's message.
  - The chart is worked out again at other As Of dates, from June 1, 2015 to May 1, 2027.
- **What the page shows.**
  - The fact table, with each fact's checks.
  - The deadlines the chart computes, as a calendar.
  - What the test found about the app beyond the model.
  - Every check.

## The facts

**Clean**: recorded as the fact is, and computed where it should be. **Awkward**: recordable, but through a workaround the model should make unnecessary. **Impossible**: the direct recording is refused, and no workaround holds the fact as it is. The Fix column names a proposal below. UI means a change to the app alone.

### The entity

| Fact | Recorded as | Verdict | Fix |
| --- | --- | --- | --- |
| Legal name | Name field | clean | |
| Former names with date ranges | A Former Name object whose Name is the old name, with From and To, related by Formerly Known As. A second Former Name entry is refused. | awkward | 1 |
| Type, jurisdiction, formation date, purpose, EIN | Choices and fields on the entity | clean | |
| Fiscal year end | A choice ("December 31"). Last Fiscal Year End is computed by mapping the choice to a month and day. | awkward | 7 |
| Status with its date | Status choice with Since beneath it. A second Status is refused, so earlier statuses survive only in the change history. | awkward | 1, 2 |
| Role in the structure | Role choice; the deadline and document rules read it | clean | |
| Identifiers: EIN, LEI and its renewal, SEC file number and CRD, CIMA number, Cayman registration number, GIIN | Each where it belongs: the CRD under SEC Registered Adviser, the GIIN under TIA Registration, the Cayman number under Jurisdiction: Cayman Islands. The LEI is a tag with its code and next renewal beneath it, since a field can't carry entries. | clean | |
| Foreign qualifications | Foreign Qualification relation to a State object, with Qualified On, Status and an Agent for Service | clean | |
| Registered agent per jurisdiction | Registered Agent relation located at the Jurisdiction choice | clean | |
| Authorized capital, shares and par value | Money and number fields. A $0.001 par value is held exactly but reads as $0.00. | clean | UI |

### Ownership

| Fact | Recorded as | Verdict | Fix |
| --- | --- | --- | --- |
| Interest type, class, percentage, commitment, effective dates | An Interest object for each holding, with those details, joined to holder and issuer by a three-sided Holding relation. Its Name is computed. Ownership and its Percentage are computed from the interests in effect. | awkward | 1 |
| One holder with two interests in one entity, one after another or at once | Two Interest objects. Two Ownership relations between the same holder and entity are refused. | impossible | 1 |
| Changes over time: the co-invest dilutes Pellbrook | Effective From and To on each interest. Ownership is worked out at the As Of date: 59.5% before June 15, 2026, and 52.5% after. | awkward | 2 |
| The structure as of a past date | An entered As Of record that every dated formula reads, and a view filter on formation date | awkward | 2 |
| Percentage from commitments | Computed at each interest | clean | |
| Total commitments, and an investor group's commitment | Computed | clean | |
| Each level adds up to 100% | Computed tag; every entity's owners add up | clean | |
| Voting and non-voting classes | A Voting tag on each interest; Voting Percentage computed; Control reads it | clean | |
| Investor groups as aggregate holders | Investor Group objects holding interests; never controllers | clean | |
| Look-through ownership | LOOKTHROUGH over the computed Ownership | clean | |
| Control | Implications on votes, general partner interests and managing-member offices | clean | |

### People

| Fact | Recorded as | Verdict | Fix |
| --- | --- | --- | --- |
| Officers and directors: title, start, end | An Office object (its Title, and Office At its company), and a Tenure relation from the holder to the office with Start and End | clean | |
| The appointing document | Appointed By relation from the tenure to the document. A formula can't read the tenure from the document's side. | clean | 3 |
| One person, two titles at one entity | Two offices. A Position choice relation would hold one title per person and company, and refuses the second. | clean | |
| The CCO hand-over | One office, two tenures; Current Holders computed at the As Of date | clean | |
| Re-appointment to an office held before | A second Tenure between the same person and office is refused | impossible | 1 |
| Everywhere a person serves | Serves As, computed from the person's tenures | clean | |
| AML officers, some provided by the administrator | Offices; one has no holder and a Provided By note | clean | |
| Cayman register filing after a director change | Register Filing Due and Status computed at the tenure | clean | |
| An appointing resolution for every director appointment | Appointing Document on File computed at each tenure | clean | |

### Signing authority

| Fact | Recorded as | Verdict | Fix |
| --- | --- | --- | --- |
| Category, dollar limits, any one or any two, a named pair, the granting document, dates | An Authority object for each rule, or each tier of a tiered rule. It is related to its entities, the entity it acts through, eligible signers or offices, senior signers, approvers and the granting document. | clean | |
| Whether a proposed set of signers may sign | An expression worked out at the entity; ten cases checked | clean | |
| Signature blocks through the chain | Signature Block computed for each signer and entity, through the general partner | clean | |
| Incumbency certificate | Computed | clean | |

### Registrations

| Fact | Recorded as | Verdict | Fix |
| --- | --- | --- | --- |
| SEC registration, Form PF filer | Tags with their numbers and dates | clean | |
| Form D: first sale, filings, open or closed | Form D Offering tag with Exemption, First Sale and Offering Status; each filing a Document | clean | |
| CIMA; TIA registration for FATCA and CRS | Tags with numbers and dates | clean | |
| CFTC exemption and annual affirmations | Tag with Claimed; each affirmation a Document | clean | |
| FinCEN BOI not required | The rule gives "not applicable": a ruled-out Deadline | clean | |

### The calendar

| Fact | Recorded as | Verdict | Fix |
| --- | --- | --- | --- |
| Deadline rules: anchor, timing, weekend handling, evidence | Rule objects. Deadline (Entity, Rule) is computed, with Last Filed, Period End, Due, Deadline Status and Amount computed at it. | clean | |
| Conditions on rules | Branches of the Deadline formula: TRUE applies, FALSE is not applicable, BLANK is not relevant | clean | |
| Weekend roll forward or back | WORKDAY | clean | |
| Leap years | Date arithmetic | clean | |
| Holidays | WORKDAY takes no holiday list | impossible | 4 |
| Status: open, due soon, overdue, filed, not applicable | Computed | clean | |
| The filed document as evidence | Filed As (Entity, Rule, Document) computed. A relation from the deadline record itself can't be computed, because the formula reads that argument as BLANK. | awkward | 3 |
| The person responsible | Responsible relation entered at the computed deadline | clean | |
| One occurrence's own status, such as an extension this year | An entered Due never moves on, so after that occurrence it reads as overdue | impossible | 1 |
| A rule that changes: Delaware's $300 becomes $400 from tax year 2026 | Amount, Earlier Amount and Amount From Year on the rule | awkward | 1, 2 |
| Fees in CI$ | Money has no currency, so CI$4,125 reads as $4,125 | awkward | 6 |
| Upcoming deadlines report | The Calendar over Due dates. It would also list computed Last Filed and Period End dates as deadlines. | clean | 5 |
| Totals across entities: $2,800 of Delaware tax | No formula lists every entity, so a report adds them up | awkward | 8 |

### Documents, KYC and the model

| Fact | Recorded as | Verdict | Fix |
| --- | --- | --- | --- |
| Type, date, status, version, link | Document objects | clean | |
| Several entities each, as subject or party | Concerns relation with a Role choice at it | clean | |
| Supersession | Supersession relation; Current Version computed | clean | |
| A filing known, its copy not on file | A Document with no Link; Copy on File computed | clean | |
| Required documents per entity type | Document Rule objects; Missing Document (Entity, Document Rule) computed | clean | |
| Missing-documents report | The attested Missing Document relations, and a Missing Documents summary for each entity | clean | 5 |
| KYC pack contents and staleness; control persons | KYC Gaps and Control Persons computed | clean | |
| Change history | The history log | clean | |
| Repeated things belong to their owner | Objects stand alone: deleting an entity leaves its interests and offices behind | awkward | 1 |
| The engine | Definitions parse, nothing errs, the state is a state | clean | |

## Proposals, ranked by how much they matter to a legal team

### 1. Objects with locations (model)

**The gap.**
- A state allows two records with the same argumentation only if they are objects (data-model.md). Today every object is a lone kind, with no location.
- So a fact that repeats at the same place can only be held as an object standing alone, related by hand to where it belongs. The test does this for:
  - interests;
  - former names;
  - offices and tenures;
  - authority tiers;
  - filings (as Documents).
- That costs four things:
  - **A Name.** Every object needs one. The test computes names for interests and offices by formula.
  - **No belonging.** Deleting Corvane leaves its three interests and its Manager office behind, related to nothing.
  - **Extra relations.** Holding, Office At and Tenure are needed only to say where these things belong.
  - **Some facts still fail.** A re-appointment repeats the Tenure relation, and an occurrence of a deadline has nowhere to go.
- The earlier round of this test found the same gap.

**The change, in data-model.md's terms.**
- **Specifications.** Replace "A node of t is a kind if and only if it is a leaf of t" with "Every leaf of t is a kind, and no node of t is a kind except its leaves and its root." A specification whose root is a kind and which has locations is a *located object*.
- **Records.** Obtain a record from its specification by replacing each leaf k with a k-object, a kind at the root with a k-object of that kind, and a field's datatype with a value.
- **Schemas.** Add one condition: a located object doesn't share a parameterization with a field, tag or choice. Located objects of different kinds may share one, as choices with different options do.
- **States.** The condition stays word for word: "any two distinct records in Σ with the same argumentation are objects." That sentence is what lets located objects repeat.

**What follows, with no further change.**
- Located objects are locations, so entries sit at them: an interest's Percentage, a filing's date.
- Their form has the sort "object" (model.html 2.2), so styles and names key to them as to anything else.
- Deleting a location deletes the located objects at it (model.html 7.2), so nothing is orphaned.
- Required entries work for them: "every company has a Director appointment."
- A located object with two locations is also a relation (data-model.md: a relation is a specification with more than one location). So an Interest located at its Holder and its Issuer is the repeatable ownership the test had to build from three records.

**In the app.**
- An object `{ kind }` may also have `at` and `edge`, or `args`, as entries and relations do (model.html 8.2).
- The rule that every object needs a Name applies only to objects without a location; a located object is known by where it is.
- In formulas, a name that reaches located objects gives the list of them, as a list of relatives does. A located object with several locations makes lists of relatives the way a relation does, each relative linked through the object, so `Owners.Percentage` reads each interest's percentage.
- In the panel, they are rows under their location with "Add another"; on the chart, lines of text by default.
- A first cut can keep definitions from covering located objects, since a formula shouldn't create objects.

**What it fixes.**
- **Interests.** Located at holder and issuer; Ownership is still computed from them.
- **Former names and status changes.** Located at the entity; the current Status can be computed from the latest change.
- **Appointments.** Located at holder and company, or at holder and office, so re-appointments repeat.
- **Filings and affirmations.** Located at their registration.
- **Deadline occurrences.** Located at the computed Deadline, one per period, carrying an extension or a "not applicable this year."
- **Rule amounts by year.** Located at the rule.
- **Holiday dates.** Located at a calendar object.
- **Authority tiers.** Located at the authority rule.

### 2. An as-of date for the computed state (formula language and session)

**The gap.**
- §1 asks for charts as of any date, and for history that isn't overwritten. The model has the history log, which records when a change was made, not when a fact took effect.
- The test makes time work with an entered As Of record that every dated formula reads (`OBJECT("As Of").Date`). Each formula carries a test for whether a record is in effect.
- Moving the record's date moves the chart: Pellbrook before and after the co-invest, the GP's members in 2024, the CCO in 2017.
- Export's "As of" field, meanwhile, only prints a date.

**The change.**
- **TODAY().** It gives the chart's as-of date: today, unless the session has set another. This is the same kind of setting as which chart and view are current (model.html 6.3), so it isn't part of the chart. The computed state is worked out at that date (model.html 4.4).
- **Export.** Its "As of" sets the date for the export.
- **ASOF(date, expression).** It works out the expression as if the as-of date were `date`, the way WITHOUT works it out as if a record weren't there. Use it, for instance, for who could sign for the fund on a closing date, or for an incumbency certificate dated in the past.
- **Two axes.** With this, the app has both: the History tab shows what the records said at a past time, and the as-of date shows what was in effect at a past date.

**What it leaves to proposal 1.**
- Effective dates are still entered as From and To on the things that change, and the current fact is computed from them, as the test does for Ownership.
- An entered relation isn't dated, so it stays drawn at every as-of date.

**The heavier alternative.** Give every entered record an effective period, and work out the state from the records in effect at each date. It is fuller, but a period isn't part of a record's tree, and every edit would have to say whether it corrects the past or starts a new period. Formulas.md's open question 15 (hiding lines by a condition) touches the same ground. I recommend the as-of date with proposal 1 first.

### 3. A relation's argument located at a relation means that relation (formula language)

**The gap.**
- formulas.md: "An argument is always an object, even when its parameter sits below the object." A parameter can also sit at a relation, which has no object; the argument then reads as BLANK.
- **Relations from a relation can't be computed.** The test's probe shows this. In a relation from each Deadline record to each document, the Deadline argument reads as BLANK at every candidate. So the evidence for a deadline had to be a three-sided relation, Filed As (Entity, Rule, Document), instead.
- **Lists of relatives lose them.** From a document, its Appointments are relatives with no record, so a formula can't count the appointments a resolution made.

**The change.** "An argument is the object its parameter sits below; where its parameter sits below no object (at a relation, or an entry of one), the argument is the record there." Lists of relatives follow the same rule. Relation calls already compare such arguments by record.

**What it fixes.** Documents as evidence of tenures, deadlines, authority rules and interests, readable from both sides, and computed where a formula can say which document it is.

### 4. Holidays in WORKDAY (formula language)

**The gap.**
- Rule 503 rolls a Form D deadline past "a Saturday, Sunday or holiday." EDGAR is also closed on federal holidays, so an "on or before" deadline that falls on a holiday moves to the business day before.
- WORKDAY skips weekends only. The day after November 10, 2026 comes out as November 11, which is Veterans Day.
- For a rule that rolls back, the computed date can then be later than the true one.

**The change.** WORKDAY takes Excel's third argument, a list of holiday dates. A holiday calendar is an object whose dates a rule reaches through a relation (`Rule.Calendar.Holidays`). With proposal 1, those dates are located objects at the calendar; without it, each holiday is an object of its own.

### 5. Deadlines and checks, marked by form (UI, with one keyed list in the chart)

**The gap.**
- The Calendar takes every date a definition covers for a deadline. The test computes dates that aren't deadlines, such as Last Filed, Period End and Last Fiscal Year End, so the Calendar would show Form ADV's last filing, March 27, 2026, as overdue.
- The missing-documents report is the attested Missing Document relations. Home's Needs attention lists only required entries left blank, so it doesn't show them.

**The change.**
- In the Schema view, a date form can be marked as a deadline, and a tag or relation form as a check.
- The Calendar takes the marked date forms. Home lists the attested records of check forms: missing documents, appointments without a resolution, Form D filings without a copy.
- The marks are kept by form, as names are. Strictly, that adds one keyed list to the chart beside the names. The model itself is unchanged.

### 6. Money in a currency (model, datatypes)

**The gap.** CIMA's fee is CI$4,125, and the chart reads it as $4,125.

**The change.**
- In model.html 1.2's terms: a money datatype for each currency. Their values are all numbers, and they differ only in how they are written, as percent and money already do.
- A field keeps one currency, since a parameterization has one datatype.
- Arithmetic that mixes currencies is an error.
- Where one field holds amounts in several currencies, a Currency choice beside it remains the way.

### 7. A month and day (model, datatypes)

**The gap.** A fiscal year end is a month and a day with no year. The test keeps it as a choice and maps it to numbers in a formula. A fiscal year end typed as "12-31" can't be read as a date by any function.

**The change.** Add a month-and-day datatype for fiscal year ends and anniversaries. NEXTDATE then takes it directly, along with a counterpart that gives the last such date on or before a date.

### 8. Every object of a kind (formula language; optional)

**The gap.** A formula reaches objects only through relations or OBJECT(name), so none can total Delaware tax across the complex. Rule tables don't need this: a relation whose candidates run over every Rule object (Deadline, Missing Document) reaches them all.

**The change.** OBJECTS(kind) gives the list of a kind's objects, as Excel lets a formula name a whole table. A report page can total without it, which is why this ranks last.

### Smaller UI changes

- **Money with small fractions.** Money shows at most two decimals, so a $0.001 par value reads as $0.00.
- **Until proposal 1.** Kinds used for repeated facts (Interest, Office, Former Name, Authority) could start hidden on the chart. Their objects could be shown under what they're related to in the panel.

## Bugs found in the app

These are bugs in the app, not gaps in the model; the test records what it observed.

1. **The app accepts an entry located at a field.**
   - data-model.md says only a specification's root may be a datatype, but `commit` accepted an Issued On date located at an EIN.
   - Either `validate` should refuse it, or the model should let a field be a location. That would let an LEI's code carry its renewal date directly.
   - Refusing it keeps the model as written. Allowing it is a small, coherent relaxation, since a choice is already a location whose output is text.
2. **The engine can give a record the wrong form.**
   - formulas.js caches a record's form and shape by the record alone (`formCache`, `shapeCache`), and takes a location it can't find yet for an object.
   - The Responsible relation, entered at a computed Deadline, had its form worked out before the Deadline existed. Its name and list names then never applied in formulas: `Responsible.Name` reads an empty list while `Person.Name` reads Rebecca A. Moretti.
   - Fix: key the caches by state as well as record, or don't cache a form while a location is missing.
3. **Definition order changes what is computed.**
   - The engine plans dependencies by names. It finds the definitions a location runs through only by their edge labels, and a computed relation whose lists are named provides list names instead.
   - Listing the Percentage-at-Ownership definition before Ownership's gives 0 percentages instead of 41.
   - Fix: a definition depends on the definitions whose scopes give the specifications its locations run through.

## Notes on the data

- **Additions to §5.**
  - Filing records §5 lists without a copy: D25–D28 (Form D filings for Fund III-A and the Offshore feeder) and D29–D30 (the CFTC affirmations of 2025 and 2026). D31 exists only inside one check.
  - Where §5's calendar has a deadline done but no document shows it, the last filing is entered at the computed deadline. Delaware's (May 20, 2026) and New York's (April 9, 2026) dates come from §5; the others are fictional.
  - The roles (subject or party) of each document's entities.
  - The Rule and Document Rule objects, transcribed from §2 and §5.
- **Rule and Document Rule objects are records, not definitions.** "Copy definitions from" doesn't carry them to another chart. A workbook library (formulas.md's open question 16) would need to cover them too.
- **"Not applicable" comes from a value formula.** The Deadline relation is defined by a value formula, so that it can give FALSE for "not applicable." Defined by implications instead, it couldn't rule anything out (formulas.md's open question 3).
