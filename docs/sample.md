# The sample

The chart a new workbook starts from, and the one to demo: Calder Ridge, a fictional private fund manager, with its Fund III family. Everything in it is fictional. It lives in [app/core/sample.js](../app/core/sample.js), and its documents in the demo SharePoint library in [app/core/sharepoint.js](../app/core/sharepoint.js).

## The fund complex

Calder Ridge Capital Management, LLC, an SEC-registered adviser owned by its two principals (Margaret A. Chen 60%, David R. Okafor 40%), manages a 2023 buyout fund. The fund family borrows its structure from [domain-research.md](domain-research.md) §5:
- **Fund III**, Calder Ridge Capital Partners III, L.P., with a Cayman feeder that holds 28.4% of it;
- **Fund III-A**, a parallel fund for ERISA plans from November 2024, investing alongside;
- **AIV-1**, an alternative investment vehicle, holding Tessellate Dental through its own blocker;
- **a co-invest vehicle**, which bought 12.5% of Corvane Specialty Chemicals in June 2026, diluting Fund III and III-A.

GP III is the general partner of the four Delaware funds. A Cayman exempted company, the Cayman GP, took over as the feeder's general partner in July 2024; it's owned by the sponsor's holding company, which also put seed capital into the BDC the manager advises. The legal and finance team are on the chart with their positions and signing authority:
- the General Counsel, Jonathan S. Ferraro;
- the CFO, Rebecca A. Moretti, who became CCO in January 2025;
- her predecessor as CCO, Thomas K. Lindqvist;
- the Cayman GP's independent director, Fiona MacAllister.

Two registered agents serve the entities, and 47 indexed documents evidence it all.

| Kind | Objects | Of them |
| --- | --- | --- |
| Entity | 17 | 5 funds (main, parallel, feeder, AIV, co-invest), 2 GPs, the manager, the holding company, 2 blockers, the BDC, 4 portfolio companies, the BDC's outside holder |
| Individual | 7 | the two principals, the BDC's independent director, and the four above |
| Investor Group | 5 | one for each fund's investors |
| Service Provider | 2 | a Delaware registered agent and a Cayman registered office |
| Document | 47 | each a file in the demo library |

That's 29 objects a chart draws as boxes (the Structure view draws 24 of them), and 808 entered records, from which 22 definitions work out 504 more in about 60 ms.

## The core

The sample's core, `SAMPLE_CORE`, is exactly the sample as it was before this one, with 14 objects: the fund, feeder, GP, manager, blocker, Northpine, Halvard, the BDC, its holder, three people and two investor groups. [formulas.md](../formulas.md)'s examples are about the core, and so are model.html's figures, the formula lab's self-test and the model test's first part. `sampleCoreState()` gives it as a chart.

The full sample is the core filled out, with four core records replaced by its history:
- The feeder's GP passed from GP III to the Cayman GP (2024-07-01), so GP III's General Partner relation to the feeder was deleted, and Chen's signing authority for the feeder now goes through the Cayman GP.
- The registered agents the core kept as text ("The Corporation Trust Company", under Jurisdiction: Delaware) were replaced by relations to a Service Provider (2025-01-15).

Both edits are in the history, and their records are in the archive, as deleting puts them there.

## How each kind of fact is modeled

| Fact | How | Why |
| --- | --- | --- |
| Role in the structure | The core's **Vehicle Type** choice, with Parallel Fund, AIV, Co-Investment Vehicle and Holding Company added to its options | It already says this. A second choice saying the same would be one fact in two places |
| Fiscal year end, EIN, formation date | Fields on the entity | Facts about the entity alone |
| Jurisdiction and what follows from it | The **Jurisdiction** choice, with the File Number or Registration Number and the annual filing last made located below it | What Delaware or Cayman asks of an entity belongs under being formed there |
| Registered agent | A tag relation, **Registered Agent** (Agent, Principal), from a Service Provider to the entity's Jurisdiction record | An agent acts for an entity in a jurisdiction. Making it an object lets one agent's entities be listed, and its address be kept once |
| Registrations | Tags on the entity, each with what it needs located below it: **Registered Investment Adviser** (with **Form PF Filer** below it), **CIMA Registered**, **LEI Registered**, **4.13(a)(3) Exemption**, **Regulation D Offering** (with **Offering Open**, ruled out once closed) | Attested means registered. A number, the date it began and when it was last filed or renewed hang below, and its deadline is worked out there |
| Positions | The core's **Position** choice relation (Director, Officer, Employee, Advisory Board Member, §57(b)(1)'s list), with **Title** and **Start Date** located at it | The option is the category the 40 Act formulas read. The title is what an incumbency certificate prints |
| Signing authority | The core's three-sided **Signing Authority** tag (Signatory, Via, On Behalf Of), with a **Limit** where there is one | "Who can sign for the AIV?" is then a list: Chen and Okafor, through GP III |
| Ownership | The core's **Ownership** tag with its **Percentage** | As formulas.md has it |
| Documents | Objects of kind **Document**, each with **Name** (its title), **Link** (a document field: its address in the library), **Document Type** and **Status** (choices), **Document Date**, and **Version** where it applies | A document is a thing in its own right, with details of its own and several entities it can be about |
| What a document is about | A tag relation, **Concerns** (Document, Subject), to each entity; the entity's list of them is its **Documents** | One document can concern many entities, and each entity lists its documents |
| What a document evidences | A tag relation, **Evidence** (Document, Evidenced), from a document to a Position record: the appointment it made | See "A document as evidence of any record" below for why it stops at positions |
| Deadlines | Date fields worked out by definitions, at the registration or jurisdiction they follow from | See below |
| Documents on file | Two tags worked out at each entity's **Entity Type**: **Formation Document on File** and **Governing Agreement on File** | Ruled out is exactly what's missing, for Home to list. Every such tag is named "… on File" |

Document types follow the library's own Document Type column: Certificate of Formation (certificates of formation, limited partnership or incorporation), Memorandum and Articles, Limited Partnership Agreement, Operating Agreement, Bylaws, Consent, Resolution, Regulatory Filing, Tax Document, and others. Statuses are Draft, Executed, Filed, Final, Form and Superseded.

Required entries are where a legal team would insist:
- on every Entity, a Formation Date, Jurisdiction and Entity Type;
- on every Document, a Link, Document Type, Document Date and Status;
- on every position, a Title and Start Date.

Each kind lists its key facts first, in the panel and the Records tables, by the chart's entry order. After the Name:
- an Entity lists its role (Vehicle Type), Entity Type, Jurisdiction, Formation Date and Fiscal Year End, then its EIN, LEI and good standing;
- an Individual lists Email, then U.S. Person;
- a Document lists Document Type, Document Date, Status and Version, then its Link.

## Deadlines

Each deadline is a date field worked out by a definition from what's entered: when the obligation was last met (a **Last Filed**, **Last Paid**, **Last Affirmed** or **Last Renewed** date), or, until it has been, from what started it (a Formation Date, or when a registration began). Entering the date it's met on moves it to the next one. None reads today's date, so a deadline is the same whenever it's asked about; whether it's overdue is for the Calendar and Home to say.

| Definition | At | Formula |
| --- | --- | --- |
| Annual Tax Due | Entity › Jurisdiction: Delaware | `= IF([Entity Type] IN {"Limited Partnership", "Limited Liability Company"} AND [Vehicle Type] <> "Portfolio Company", DATE(YEAR(MAX([Annual Tax Paid], [Formation Date])) + 1, 6, 1), BLANK())` |
| Annual Tax Amount (money) | Entity › Jurisdiction: Delaware | `= IF(ISBLANK([Annual Tax Due]), BLANK(), IF(YEAR([Annual Tax Due]) - 1 >= 2026, $400, $300))` |
| Franchise Tax Due | Entity › Jurisdiction: Delaware | `= IF([Entity Type] = "Corporation" AND [Vehicle Type] <> "Portfolio Company", DATE(YEAR(MAX([Franchise Tax Paid], [Formation Date])) + 1, 3, 1), BLANK())` |
| Annual Return Due | Entity › Jurisdiction: Cayman Islands | `= IF([Vehicle Type] <> "Portfolio Company", DATE(YEAR(MAX([Annual Return Filed], [Formation Date])) + 1, 1, 31), BLANK())` |
| Form ADV Due | Entity › Registered Investment Adviser | `= IF([Fiscal Year End] = "December 31", NEXTDATE(12, 31, [Last Filed]) + 90, BLANK())` |
| Form PF Due | Entity › Registered Investment Adviser › Form PF Filer | `= IF([Fiscal Year End] = "December 31", NEXTDATE(12, 31, [Last Filed]) + 120, BLANK())` |
| Annual Fee Due (CIMA) | Entity › CIMA Registered | `= DATE(YEAR(MAX([Last Paid], [Registered On])) + 1, 1, 15)` |
| Form D Due | Entity › Regulation D Offering | `= IF([Offering Open], LET(due, EDATE([Last Filed], 12), WORKDAY(due - 1, 1)), BLANK())` |
| Affirmation Due (CFTC 4.13(a)(3)) | Entity › 4.13(a)(3) Exemption | `= LET(due, NEXTDATE(12, 31, MAX([Last Affirmed], [Claimed On])) + 60, WORKDAY(due - 1, 1))` |
| Next Renewal (LEI) | Entity › LEI Registered | `= EDATE(MAX([Last Renewed], [Registered On]), 12)` |

Notes on them:
- **Who files.** The jurisdiction rules skip portfolio companies, which keep their own; the registration rules apply wherever a registration is recorded.
- **Annual Tax Amount** encodes HB 400: $400 from tax year 2026, $300 before. AIV-1's overdue tax is for 2025, so it shows $300.
- **Leap years.** "+ 90" and "+ 120" count days, so the Form ADV after a 2027 year end is due March 30, 2028, not March 31.
- **Weekends.** `WORKDAY(due - 1, 1)` moves a weekend due date to the Monday, as Rule 503 says for Form D and NFA practice for 4.13(a)(3). The co-invest's Form D anniversary, June 26, 2027, is a Saturday, so it's due June 28. The 4.13(a)(3) affirmation for 2025 was due March 2, 2026, since March 1 was a Sunday.
- **Conditional.** Form D is amended only while Offering Open is attested. Fund III's, III-A's and the feeder's offerings closed at the final close (ruled out on 2025-03-31), so only the co-invest and the BDC's continuous offering have one due.

As of October 25, 2026 there are 23 deadlines:
- **overdue (2):** AIV-1's Delaware tax (June 1, 2026), never paid, which is why AIV-1 is out of good standing; and Fund III-A's LEI renewal (September 24, 2026);
- **due within 30 days (2):** the BDC's Form D amendment (November 10) and Fund III's LEI renewal (November 14);
- **later (19):** CIMA's fee and two Cayman annual returns in January, two franchise taxes and three affirmations on March 1, the manager's LEI, Form ADV, the feeder's LEI and Form PF in March and April, six Delaware taxes on June 1, 2027, and the co-invest's Form D on June 28.

## Documents on file

| Definition | At | Formula |
| --- | --- | --- |
| Formation Document on File | Entity › Entity Type: Limited Partnership, Exempted Limited Partnership, Limited Liability Company, Corporation, Exempted Company | `= IF([Vehicle Type] = "Portfolio Company", BLANK(), LET(wanted, IF(@ = "Exempted Company", "Memorandum and Articles", "Certificate of Formation"), ANY(Documents, @.[Document Type] = wanted AND @.Status IN {"Executed", "Filed", "Final"})))` |
| Governing Agreement on File | the same | `= IF([Vehicle Type] = "Portfolio Company", BLANK(), LET(wanted, IFS(@ IN {"Limited Partnership", "Exempted Limited Partnership"}, "Limited Partnership Agreement", @ = "Limited Liability Company", "Operating Agreement", @ = "Corporation", "Bylaws", @ = "Exempted Company", "Memorandum and Articles"), ANY(Documents, @.[Document Type] = wanted AND @.Status IN {"Executed", "Filed", "Final"})))` |

They're worked out for the 12 entities the team keeps, and ruled out for exactly the gaps below.

## The deliberate gaps

For the demo to show what's missing, after domain-research.md §5:
- **Documents not on file:**
  - the holding company's certificate of formation and LLC agreement;
  - Fund III-A's certificate of limited partnership;
  - the feeder's certificate of registration;
  - AIV-1's certificate of limited partnership and limited partnership agreement;
  - the AIV-1 Blocker's bylaws;
  - the co-invest's certificate of limited partnership.

  These are the eight "… on File" tags ruled out. Also missing, though no rule asks for them: the Cayman GP's register of directors, Form D copies for Fund III-A and the feeder, and a good standing certificate for anyone.
- **Library files not indexed:** the board resolutions appointing MacAllister (so her position has no evidence), an MFN election form, and an investor presentation. The Documents area lists them as Not linked.
- **Required entries left blank:**
  - Northpine's and Halvard's Formation Date (from the core);
  - the pension plan's Jurisdiction (from the core);
  - the Document Date of Okafor's appointment email;
  - the Start Date of Raman's directorship.
- **Overdue:** AIV-1's Delaware tax and Fund III-A's LEI, above.
- **Superseded:** the feeder's 2023 ELP agreement, by the 2024 amended and restated one; and the 2025 Form ADV, by the 2026 one.

## Views

| View | Shows | Layout |
| --- | --- | --- |
| Structure | Every entity and investor group, and the two principals; hides the people who hold nothing | Investors along the top, the funds beneath them; GP III and the manager sit between Fund III and the feeder, so GP III's lines reach only its own funds; then the holdings |
| 40 Act | The BDC and its 22 close and remote affiliates, by the core's filter | Its own: the BDC as a wide bar, its affiliates in a row above and a row below, so each line runs straight to it |
| Fund III | The fund family alone: investor groups, funds, GPs, blockers and portfolio companies, by a filter on Vehicle Type | Structure's |
| Management and control | The people and the sponsor's entities (manager, GPs, holding company, BDC), with ownership, positions (labeled by category) and the BDC's adviser (dotted) | Its own: people above where they serve |

No view draws boxes for documents or service providers; View › Show brings them.

## The history

The sample comes with 108 history entries, from June 20, 2024 to October 2, 2026, made by three of the team:
- Jordan Alvarez, the paralegal, recording entities, documents and filings;
- Jonathan S. Ferraro, the General Counsel, recording appointments, the GP change and consents;
- Rebecca A. Moretti, recording filings and payments.

They tell the stories §5 lists:
- the Cayman GP formed and taking over the feeder;
- Fund III-A, AIV-1, its blocker, Tessellate, Corvane and the co-invest added as they were formed or bought;
- the CCO hand-over from Lindqvist to Moretti (January 2, 2025);
- MacAllister replacing Lindqvist on the Cayman GP's board (June 30 and July 1, 2025);
- the registered agents moving to Wilmington Harbor (January 15, 2025);
- the co-invest diluting Corvane (June 15, 2026);
- AIV-1 falling out of good standing (July 15, 2026);
- the definition of Annual Tax Amount added after HB 400 (June 3, 2026);
- each year's filings and payments moving their deadlines on.

**How it's made.** The sample as it is now is written out. `SAMPLE_HISTORY` lists the steps that made it, oldest first, each saying when, who, and what it did:
- `adds` names the records it added, each with whatever depends on it, less what later steps added;
- `was` gives the records it changed or deleted, as they were before;
- `defines` names the definitions it added.

`sampleHistory` walks back from now through the steps. At each one it works out the entry with the model's own `changesBetween` and `changeSummary`, so every entry is exactly what an edit in the app records: when, who, a summary, and the changed records before and after. What a step deleted goes to the archive, labeled as deleting labels it. The schema keeps every specification the past had, so the text Registered Agent the core used shows as Unused in the Schema.

It's deterministic, ids included. Resetting to the sample doesn't duplicate the past, and `isSamplePast` tells it from what was done in a workbook. The model test walks the history back from the sample and checks two things:
- every entry finds its records as it left them, and leaves a state;
- nothing is dated after the day it was recorded, and nothing from before the history began is dated after it began.

## What the model couldn't say cleanly

These are left as they are, for us to decide.

1. **A month and a day.** Fiscal Year End is text ("December 31"), as the core has it. There's no datatype for a date that recurs each year, so a formula can't read one. Form ADV and Form PF therefore read only the December 31 every Calder Ridge entity has, and give nothing for any other year end. A datatype for an annual date, with NEXTDATE taking one (`NEXTDATE([Fiscal Year End], [Last Filed]) + 90`), would say it properly.
2. **Facts with dates.** Nothing is "as of" a date.
   - Ownership has no effective dates: Corvane's dilution is only in the history.
   - A relation that ended is deleted rather than dated: GP III as the feeder's GP, Lindqvist's directorship. The history keeps them, but the records don't say "until".
   - A position's title can change but keeps one Start Date: Moretti has been CCO since January 2025, and only the history says so.
   - Charts as of a date, which the research asks for, need this.
3. **Repeated facts.** A record has one entry per label at a location, and a relation one record per set of arguments. So some things repeat badly:
   - several former names;
   - several identifiers of one type;
   - several Form D filings for one offering (only the last is kept);
   - several titles in one company (Moretti is CFO and CCO in one Title);
   - several signing categories, each with its own limit, for one signer;
   - foreign qualifications, each with its own agent (Jurisdiction is the one place of formation).

   Each wants a list of entries of one shape.
4. **A document as evidence of any record.** A relation's form includes the shape of each location. So Evidence to a Position is a different form from evidence to a Signing Authority or an Ownership, and each would need its own name, styles and lists: a family of relations, not one. The sample has evidence of positions only.
5. **Which period a payment was for.** Last Paid is a date, and the formulas take it to fall in the year its deadline does. A CIMA fee paid in December for the next year would be read as last year's. Recording the period paid (a tax year) would be exact.
6. **MAX of nothing.** As in Excel, MAX of no dates gives 0, so a deadline with nothing to anchor it gives #VALUE! rather than nothing. The sample anchors every deadline (a Formation Date, Registered On, Claimed On), but a new registration without one would show the error.
7. **Who owns a fund.** Investor groups stand for many investors as one owner, and a GP's interest isn't recorded as ownership, as in the core. The Tax Classification formula therefore doesn't count an investor group as a single owner (`KIND(Owners) <> "Investor Group"`), so Fund III-A, AIV-1 and the co-invest come out as partnerships, as entered. Also, AIV-1's investors are really the funds' partners pro rata, which one group only approximates.
8. **Required entries are per parameterization.** "A Title on every position" is three requirements, one per option in use (Director, Officer, Employee). A position as Advisory Board Member wouldn't be required until someone requires that one too. A requirement can't be conditional either, such as an EIN for U.S. entities only.
9. **Superseded by what.** Status says a document is superseded, not by which. A Supersedes relation between documents would say it.
10. **Joint signing.** "Any two of" or "a named pair" can't be said on a relation from one signer.
11. **Working days** skip weekends but not holidays.
