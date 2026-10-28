# From fund documents to Dendra's records

What a fund legal team's usual documents say, and where each fact goes. The labels are the sample chart's (`vocab` on the sample). A firm's own chart may name things differently, so check `vocab` on its workbook, and use its words where they differ.

## Contents
- [The entities](#the-entities)
- [Who owns what](#who-owns-what)
- [Who controls and signs](#who-controls-and-signs)
- [Registrations, filings and payments](#registrations-filings-and-payments)
- [Documents](#documents)
- [Reading a structure chart or a spreadsheet](#reading-a-structure-chart-or-a-spreadsheet)
- [What to ask the person](#what-to-ask-the-person)

## The entities

Every legal entity is an **Entity**. People are **Individuals**. A body of investors charted as one box (the fund's LPs, "U.S. Investors") is an **Investor Group**, with Beneficial Owners, the count section 3(c)(1) uses.

| Source | Says | Record |
| --- | --- | --- |
| Delaware Certificate of Limited Partnership | name, filing date, file number, registered agent | Entity: Name, Formation Date (the filing date), Jurisdiction Delaware with File Number, Entity Type Limited Partnership; a Registered Agent relation from the agent (a Service Provider) |
| Delaware Certificate of Formation | the same, for an LLC | Entity Type Limited Liability Company |
| Certificate of Incorporation | the same, for a corporation (often a blocker), and authorized shares | Entity Type Corporation, with Authorized Shares at it |
| Cayman certificate of registration (ELP) | name, registration date, number, registered office | Jurisdiction Cayman Islands with Registration Number and Registered Office; Entity Type Exempted Limited Partnership |
| Cayman certificate of incorporation (exempted company) | the same | Entity Type Exempted Company |
| LPA, LLC agreement, offering memorandum | the vehicle's role, fiscal year, target size | Vehicle Type (Main Fund, Feeder Fund, Parallel Fund, AIV, Co-Investment Vehicle, Blocker, General Partner, Management Company, Holding Company, Portfolio Company, or Third Party for an investor or buyer that isn't the sponsor's, whose filings aren't tracked); Fiscal Year End; Target Commitments; Investment Company Status (3(c)(1) or 3(c)(7) Fund) |
| Good standing certificate | standing on a date | Good Standing true, with no day if it's been so all along. If it was lost or restored on a date, give that day |
| Certificate of cancellation or dissolution | the end | Dissolution Date |

- **Formation Date starts the entity.** The chart as of an earlier day doesn't show it. Use the date the formation document was filed, not the date it was signed.
- **Short Name** is what the chart's boxes may show where room is short ("Fund IV", "GP IV"). Give one where the firm has a usual short form; don't invent one.
- **Worked out, never entered:** Private Fund, Investment Company, Tax Classification (the default; an election is an override), BDC Affiliate, 3(c)(1) Count.

## Who owns what

**Ownership** relates an Owner (Entity, Individual or Investor Group) to what it owns (Entity), with **Percentage**: the economic share, as the source states it.

- **Where the shares come from:**
  - in a fund, the LPs' share (by commitment, or as the cap table or chart says);
  - in an LLC, the members' percentage interests;
  - in a corporation, the share of outstanding shares.
- **Ownership Adds Up** is a check. It fails where the owners recorded don't hold 100%, except at a portfolio company or a BDC, whose other holders the chart doesn't track. A failure after you record a fund usually means its LP base isn't recorded yet. Record the LPs as Investor Groups and Individuals as the chart groups them, or report the gap.
- **Voting Percentage** is worked out: a limited partnership interest carries no vote, and anything else votes with its Percentage. Enter it, as an override, only where a document gives a different vote.
- **A GP's commitment:** a general partner's own capital is an Ownership too, often 1% or less, beside its General Partner relation.
- **A closing that changes percentages** is a change on that day: give the closing date as the day.

## Who controls and signs

| Relation | Sides | Value and entries | Source |
| --- | --- | --- | --- |
| General Partner | GP → Partnership (an LP or ELP) | Admission Date, Withdrawal Date | LPA; certificate of LP; amendment admitting or withdrawing a GP |
| Membership | Member (an Individual) → LLC | Managing Member or Member | LLC agreement; written consents |
| Position | Holder (an Individual) → Company | Director, Officer or Employee; Title, Start Date, End Date | board minutes or consents; incumbency certificate; register of directors |
| Signing Authority | Signatory, On Behalf Of, Via | Capacity (Managing Member, General Partner, Director, Officer, Authorized Signatory); Start Date; Limit | incumbency certificate; signature blocks; authorizing resolutions |
| Investment Adviser | Adviser → Client | | investment advisory or management agreement |
| Registered Agent | Agent (a Service Provider) → Principal | | formation certificate; agent change filings |

- **A signing authority runs through an entity.** Chen signs for Fund III (On Behalf Of) via GP III (Via), as its Managing Member (Capacity). The tool names it "Margaret A. Chen for Fund III, via GP III". Capacity Held is worked out: it checks Chen holds that capacity at GP III. A failure means the record or the authority is wrong; report it.
- **Control, Affiliated Person and close or remote affiliate** are worked out from these. Never enter them.
- **Evidence:** a document that evidences a position or a signing authority is related to it by Evidence, with the relation's id as the Evidenced side.

## Registrations, filings and payments

Record the registration, and the date each filing or payment was made. Dendra works out the next due date, and moves it on as filings are recorded.

| Registration (a checkbox at the Entity) | Its entries | What Dendra works out |
| --- | --- | --- |
| Registered Investment Adviser | Registered On, SEC File Number (801-…), CRD Number, Last Annual Amendment; Form PF Filer, with Last Annual Update | Form ADV Due (90 days after the fiscal year end); Form PF Due (120 days) |
| Regulation D Offering | File Number (021-…), First Sale, Last Filed, Offering Open | Form D Due (the anniversary while open) |
| LEI Registered | LEI, Registered On, Last Renewed | Next Renewal |
| 4.13(a)(3) Exemption | Claimed On, Last Affirmed | Affirmation Due (60 days after the year end) |
| CIMA Registered | CIMA Number, Registered On, Last Paid, Audited Accounts Filed | Annual Fee Due (January 15); Audited Accounts Due (6 months after the fiscal year end) |
| TIA Registered | Registered On, CRS Filed, FATCA Filed | CRS Due, FATCA Due |

At a Jurisdiction:
- **Cayman Islands:** Annual Return Filed; Annual Return Due is worked out.

**Delaware's tax for each year** (an LP or LLC its annual tax, a corporation its franchise tax, each year from the one it was formed):
- The Annual Tax relation of the taxpayer and a Tax Year is worked out.
- Record each payment at the earliest year still due, from the day it was paid, as Paid… does: `{ "relation": "Annual Tax", "sides": { "Taxpayer": "Fund III", "Tax Year": "2025" }, "entries": { "Annual Tax Paid": "2026-05-28" }, "day": "2026-05-28" }`. The chart as of an earlier day then still shows the tax owed.
- Tax Years are objects (Name "2025", Year 2025). Add the ones the entities need, if the chart hasn't them.

**A filing made again** (a renewal, an annual amendment) changes the "last" date. Set it with the filing's date as the day, so the earlier filing stays on record before it.

## Documents

Each document the record rests on is a **Document**:
- Name: as the firm titles it, usually type, then entity;
- Document Type;
- Document Date;
- Status: Draft, Final, Executed, Filed or Superseded;
- Version, where there are several;
- Link.

It's related by **Concerns** to each entity it's about.

- **Link** is where the firm keeps it: a SharePoint or OneDrive address, a NetDocuments or iManage link, EDGAR, or a file path. Dendra opens it from the chart.
  - Use the address the person gives you, or the one the file has where you read it.
  - Never link to a copy you made.
  - Never put the document's contents in the workbook.
- **The "on file" checks:**
  - Formation Document on File wants a filed certificate of the entity's type: of limited partnership, formation or incorporation, articles of incorporation, a Cayman certificate of registration, or memorandum and articles.
  - Governing Agreement on File wants an executed LPA, operating agreement, bylaws, or memorandum and articles.

  These checks fail until such documents are linked. That's the record working, not an error of yours. Link the ones you have, and report the rest.
- **An amended and restated agreement** supersedes the one before. Set the old one's Status to Superseded on the new one's date (a day), and add the new one as Executed.

## Reading a structure chart or a spreadsheet

- **A structure chart** (PowerPoint or PDF) is a source like any other:
  - each box is an entity, person or investor group;
  - each line with a percentage is an Ownership;
  - a dashed line labeled GP is a General Partner;
  - the legend says the rest.

  It doesn't give formation dates, file numbers or documents. Record what it shows, and list what it doesn't, for the person.
- **An entity list or spreadsheet** maps column by column to entries. Before writing the plan, match each column to a label in `vocab`, and each value to an option. Ask about any column that has no label.
- **When sources disagree** (the chart says 71.6% and the cap table 71.5%), record neither. Ask.

## What to ask the person

Ask before recording when:
- **Sources disagree**, or a fact you need isn't in them.
- **Correction or change?** It's unclear whether something is a correction (no day) or a change on a date (a day).
- **New words:** the chart would need a new kind, label or option.
- **Overrides:** an entry would stand over a formula.
- **Duplicates:** an object you'd add might already be there under another name (`show` the likely ones).
- **Deletions:** you'd remove or end something.

Record everything else, show the dry run, and ask your questions together, once.
