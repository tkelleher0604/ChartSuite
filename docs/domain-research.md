# Research: an entity system of record for a fund legal team: requirements, deadlines, products, SharePoint, and demo data

**Research status, 25 Oct 2026.** I checked rules against primary sources wherever I could. Each item is marked verified or secondary.

**Corrections to your brief:**
- **Delaware LP/LLC tax.** The annual tax for Delaware LPs, LLCs and GPs is now **$400, not $300**. It applies from tax year 2026, first payable June 1, 2027. The change is HB 400, signed May 21, 2026 and retroactive to Jan 1, 2026.
- **FinCEN BOI.** A final rule (issued Aug 11, effective Aug 14, 2026) permanently exempts US companies and US persons. Only foreign entities registered to do business in a US state still report.
- **Form PF.** The compliance date for the 2024 Form PF amendments is now **July 1, 2027**. File on the current form until then.
- **Cayman CRS.** The reporting deadline moves from July 31 to **June 30**, starting with the 2026 reporting year. FATCA stays July 31.
- **Adviser AML rule.** FinCEN's anti-money-laundering rule for investment advisers is postponed to **Jan 1, 2028**.

---

## 1. Requirements

"Must" means needed for a convincing demo. "Later" means phase 2.

**Entity profile**
- **Must: core fields.**
  - Legal name, plus former names with date ranges, so documents signed under an old name still match.
  - Entity type, jurisdiction, formation date and fiscal year end.
  - Status with its date: active, in dissolution, dissolved or merged.
  - A one-line purpose.
  - A **role in the structure**: manager, GP, main fund, parallel fund, feeder, AIV, blocker, co-invest, portfolio or holding company. The role drives chart styling, the required-documents checklist and the deadline rules.
- **Must: identifiers.** Keep them as a repeatable list of type, number and dates. That covers the EIN, the LEI (with its next renewal date), SEC file and CRD numbers, the CIMA number, the Cayman registration number and the GIIN.
- **Must: agents and documents.** Registered agent or office per jurisdiction, including foreign qualifications, plus links to the governing documents.
- **Later:** fund terms (closings, investment period, extensions) and service providers (administrator, auditor, counsel).

**Ownership and capitalization**
- **Must:**
  - Store ownership as dated links from holder to entity, each with:
    - interest type (LP interest, GP interest, LLC units or shares);
    - class or series;
    - percentage;
    - commitment;
    - effective from and to dates.
  - Investor groups act as aggregate holders.
  - Warn when one level doesn't add up to 100%.
  - Show charts as of any date.
- **Later:** full cap tables (share counts, certificates, transfer ledger), look-through percentages, carry splits and vesting. Capital accounts stay with the administrator.

**Officers, directors, managers and signatories**
- **Must:** records of person, role and entity, with title, start date, end date and the appointing document. Add a person view ("everywhere this person serves"). Keep history; don't overwrite it.
- **Later:** reminders to file Cayman register changes, D&O questionnaires, term-expiry alerts.

**Signing authority**
- **Must:** authority rules per entity, each giving:
  - document category;
  - dollar limit;
  - who signs (any one, any two, or a named pair);
  - the document that grants the authority;
  - valid dates.
- **Must:** generate signature blocks through the chain ("Fund, by its GP, by its Managing Member") and incumbency certificates from the same data. This is a strong demo moment.
- **Later:** a register of powers of attorney with expiries, reconciliation against bank mandates, and approval workflows.

**Registrations**
- **Must:** one record type for every registration: regulator or state, type, number, effective date, status, and the deadline rule it triggers. It covers:
  - foreign qualifications;
  - SEC adviser registration and Form ADV history;
  - a Form D record per offering;
  - Form PF filer status;
  - CFTC/NFA exemptions such as 4.13(a)(3);
  - CIMA registration;
  - Cayman FATCA/CRS registration with the Tax Information Authority (TIA).
- **Later:** pulling filing status automatically from EDGAR, IAPD and state databases.

**Compliance calendar**
- **Must:**
  - Compute deadlines by rule from entity data: jurisdiction, type, fiscal year end and registrations.
  - Rules carry conditions, e.g. a Form D amendment is due only while the offering is open.
  - Rules carry weekend handling.
  - Each deadline has a status (open, filed, not applicable) with a link to the filed document, and an owner.
  - An "upcoming deadlines" report.
- **Later:** event-triggered deadlines (Cayman director change: 30 days; Cayman ELP GP change: 15 days; CIMA material change: 21 days), email reminders and recurring tasks.

**Documents and versions**
- **Must:**
  - Index records that point to SharePoint, each with:
    - title, type and document date;
    - status (draft, executed, filed, superseded);
    - version label;
    - links to one or more entities;
    - the SharePoint link.
  - Required-document rules per entity type, feeding a missing-documents report.
- **Later:** two-way SharePoint sync, AI extraction of dates and parties, side-letter obligation tracking.

**KYC/AML basics**
- **Must:** a one-click **KYC pack** per entity: formation and governing documents, good standing certificate, incumbency certificate, structure chart, W-9 or W-8, LEI and control persons. Banks, subscription-line lenders and deal counterparties ask for this constantly. Track the Cayman AML officer roles (AML compliance officer, money laundering reporting officer and deputy) as ordinary positions.
- **Later:** investor KYC (usually the administrator's job), sanctions screening and refresh cycles.

**Audit trail, permissions, reporting and exports**
- **Must:**
  - An audit log of every change: who, when, old value and new value.
  - Three basic roles: viewer, editor and admin.
  - Exports: the org chart to PowerPoint (editable shapes) and PDF; entity, officer and calendar lists to Excel.
  - Reports: entity list, positions by person, upcoming deadlines and missing documents.
- **Later:** field-level restrictions (personal data, tax IDs), maker-checker approval, single sign-on, an API and scheduled reports.

---

## 2. Compliance deadlines

**How to state each rule so it can be computed:**
- **Anchor:** fiscal year end, calendar year end, formation date, first sale, last filing, or a triggering event.
- **Timing:** an offset (a number of days or months) or a fixed month and day.
- **Repeat:** how often the deadline recurs.
- **Condition:** when the rule applies.
- **Weekend rule:**
  - Rules that say "within N days" roll forward to the next business day. Rule 503 says so explicitly for Form D.
  - For "on or before" rules, file by the business day before.
- **Leap years:** 90 days after Dec 31 is March 31, but March 30 in a leap year.

**Delaware**
- **Corporations, e.g. a blocker.** Verified on the Division of Corporations site.
  - The annual report and franchise tax are due **March 1** for the prior year. The report fee is $50.
  - The minimum tax is $175 under the authorized-shares method, or $400 under the assumed-par-value-capital method.
  - The maximum tax is $200,000, or $250,000 for large corporate filers.
  - Late filing costs a $200 penalty plus 1.5% interest a month.
  - Anyone owing $5,000 or more pays estimates: 40% by June 1, 20% by Sept 1, 20% by Dec 1, and the rest by March 1.
- **LPs, LLCs and GPs.**
  - The annual tax is due **June 1** for the prior calendar year.
  - There is no annual report and no proration. The tax is owed if the entity was on the register at any time during the year.
  - Late payment costs $200 plus 1.5% a month.
  - The amount is $300 through tax year 2025 and **$400 from tax year 2026**. Each registered series pays $100, up from $75.
  - The $400 figure is verified on the Delaware site. The effective-date detail comes from Withum and Bloomberg Tax.

**Cayman Islands**
- **Exempted company.**
  - The annual return and fee are due in January of each year after incorporation. The registered office sends its invoice in October.
  - There is no penalty if you file before April 1. After that the penalty is 33.33% of the fee (April to June), 66.67% (July to September), or 100% (October to December).
  - The fee depends on authorized capital: US$1,129 (up to US$50,000), US$1,494, US$2,694 or US$3,407.
  - The economic substance notification is filed with the return.
- **Exempted limited partnership (ELP).** Same timing and penalties.
  - US$1,586 if registered under the Private Funds Act, US$2,561 if not.
  - The Registry's own page confirms January. Amounts come from Harneys (July 2026) and match Mourant's 2025 figures.
  - The Registry fee schedule PDF returned a 404, so I couldn't check it directly.
- **CIMA, for a registered private fund such as the feeder.**
  - The annual fee is due **January 15**: CI$4,125 (about US$5,031), plus CI$525 (about US$641) per AIV.
  - Late payment adds 1/12 of the fee for each month outstanding.
  - From 2027 it becomes a single consolidated payment through CIMA's REEFS portal.
  - Fee, date and AIV fee are verified in CIMA's Feb 2026 notice.
  - Audited accounts and the Fund Annual Return are due **within 6 months of fiscal year end**, i.e. June 30 (from Harneys).
  - Material changes must be filed within 21 days (from Harneys).
- **Automatic exchange of information (FATCA/CRS).** Source: Maples.
  - FATCA reporting is due July 31.
  - CRS reporting and the CRS compliance form are due **June 30**, starting with the 2026 reporting year. Before that the dates were July 31 and Sept 15.
- **Changes that trigger a filing:**
  - register of directors: within 30 days;
  - change of ELP general partner: within 15 days, and the change takes effect only once filed;
  - other ELP registered details: within 60 days.

**SEC**
- **Form ADV annual updating amendment.**
  - Due **within 90 days after fiscal year end**: March 31 for a Dec 31 year end. Some items also need prompt interim amendments.
  - Verified in the SEC-hosted General Instructions.
  - The brochure (Part 2A) or a summary of material changes goes to clients within 120 days of year end under Rule 204-3. Secondary sources only.
- **Form D.** Verified in 17 CFR 230.503.
  - Due **within 15 calendar days after the first sale**, meaning the date the first investor is irrevocably committed. A weekend or holiday deadline moves to the next business day.
  - While the offering continues, amend annually on or before the anniversary of the most recent filing.
  - Also amend as soon as practicable for material mistakes and certain changes. No amendment is needed after the offering ends.
  - State notice filings are generally due within 15 days of the first sale in that state. Akin Gump; some states, such as New York, differ.
- **Form PF.** Applies to SEC-registered advisers with at least $150M in private fund assets.
  - A private equity adviser files an annual update **within 120 days after fiscal year end**: April 30, or April 29 in a leap year.
  - It also files "Section 6" event reports within 60 days after the end of the quarter in which an event occurs. Events are adviser-led secondaries, removal of the GP, or termination of the fund or its investment period.
  - Large hedge fund advisers file quarterly within 60 days. Large liquidity fund advisers file within 15 days.
  - The instructions are verified (SEC Form PF, Instruction 9).
  - On Aug 31, 2026 the 2024 amendments' compliance date moved to July 1, 2027, while an April 2026 proposal to scale them back is considered. Source: MoFo.
- **Form 13F.** Verified in the SEC FAQ.
  - Due within 45 days after each quarter end, for a manager with discretion over at least $100M of 13(f) securities on the last trading day of any month.
  - It usually matters only after a portfolio company goes public.
- **Form 13H.** Large traders only: 2M shares or $20M in a day, or 20M shares or $200M in a month.
  - File promptly, roughly within 10 days.
  - Then file annually within 45 days after year end.
  - Secondary sources only, and likely not applicable here.

**CFTC/NFA**
- The 4.13(a)(3) exemption must be affirmed **within 60 days after calendar year end**, i.e. March 1. In 2026 that fell on a Sunday, so the date was March 2.
- Missing it counts as withdrawing the exemption. Verified on the NFA site.

**FinCEN BOI**
- US companies are permanently exempt. A foreign entity registered in a US state reports within 30 days of the registration taking effect. Verified on fincen.gov.
- For this fund complex nothing is due. The Cayman entities aren't registered in any US state. Record that as a status, not a deadline.

**CFIUS**
- This is a deal-level item, not an entity deadline. A mandatory declaration is due at least 30 days before closing (31 CFR 800.401).
- Track it only for portfolio deals with foreign investors, or foreign LPs with special rights. Later.

**Foreign qualifications and other renewals** (model these as a per-state rule table)
- **New York LLC:** biennial statement every two years, in the anniversary month of filing, $9. Verified with NY Department of State.
- **California LLC:** Statement of Information every two years, $20, with a $250 late penalty. From an archived state notice plus secondary sources.
- **Texas:** franchise tax report due May 15.
  - The no-tax-due threshold is $2.65M for 2026 reports, but an information report is still required.
  - The threshold is verified with the Comptroller; the date comes from secondary sources.
- **LEI:** renew each year by its "next renewal date", or it shows as "lapsed". Source: GLEIF.

**What I couldn't verify against primary sources:**
- Cayman Registry fee amounts and penalty tiers (from Harneys and Mourant).
- CIMA's 6-month audit deadline and 21-day change rule (Harneys).
- The Cayman CRS date changes (Maples).
- The 2026 Form PF extension (law-firm alerts; the SEC's own release covers the 2025 extension).
- Form 13H.
- The timing for delivering the Form ADV brochure.
- The delay of the adviser AML rule (MoFo).
- California and Texas details.
- Whether Form ADV and Form PF deadlines roll past weekends in practice.

---

## 3. What the main products offer

- **Athennian**
  - Entity and people records, including KYC, registrations and compliance details.
  - Appointments covering directors, officers, powers of attorney and signing authorities.
  - Equity and debt structures (cap tables), and live structure charts built from the data.
  - Compliance-date tracking with task lists and reports.
  - Templates, document automation and e-signature, plus a virtual minute book.
  - Audit trails, detailed permissions and custom fields.
  - A two-way API and an iManage integration.
  - AI workflows that answer with cited sources.
  - "Athennian for Private Markets" launched June 1, 2026, covering SPVs, parallel funds, AIVs and feeders.
  - I found no SharePoint connector.
- **Diligent Entities**
  - One permissioned record of entities, ownership, authorities and filings across more than 100 jurisdictions.
  - Automated structure charts with filters, conditional formatting and what-if modeling, exported to **PowerPoint and Visio**.
  - AI answers with sources, and audit trails.
  - Integrates with Diligent Boards (approvals and e-signature) and its Data Room.
  - A customer quote praises "reports on what is missing".
- **CSC Entity Management**
  - Central record including trade names, prior names and merger history, with unlimited custom fields.
  - Structure charts, including modeling of pending ownership changes.
  - D&O data fed from Workday; ownership and cap tables.
  - An automatic US and global compliance calendar, including annual reports.
  - Minute-book storage and search, guided document generation and DocuSign.
  - Built-in filing to the SEC and Companies House, plus APIs.
  - Data flows in from CSC's own registered agent and filing services.
  - Flat fee with unlimited users.
- **Carta**
  - A fund administration platform rather than a standalone entity manager.
  - It forms the fund LP, GP LLC and management company through a third-party registered agent.
  - It also covers GP and management company administration, KYC/AML, and Form ADV and Form PF tooling.
  - Its guide argues for one entity record plus an automated compliance calendar.
  - Carta blocked automated access, so I couldn't confirm chart export or a dedicated module.
- **Mainstreet**
  - A small-business "operating system": formation in all 50 states, EINs, cap tables (it acquired Capbase in Oct 2025), bookkeeping and tax credits.
  - Not a fund legal tool and not the bar.
  - A separate company, "Mainstreet Business", sells registered-agent and compliance services per entity.
- **Clio**
  - Law-firm practice management. No built-in entity management; third parties add minute-book integrations.
  - Relevant only as a model of linking documents to matters.

**The bar:**
- one record driving charts, reports and the calendar, with dated history;
- chart export to PowerPoint and Visio;
- a calendar that knows each jurisdiction's rules;
- D&O and signing authority;
- documents linked to entities;
- an audit trail and APIs;
- increasingly, AI answers with citations.

**Where you can stand out:**
- spreadsheet-speed editing;
- fund roles (feeder, AIV, blocker) as first-class concepts;
- deadline formulas the user can see;
- an index over SharePoint rather than yet another document store.

---

## 4. SharePoint as the document repository

**How teams organize documents**
- **Law firms** work by matter. Each client and matter gets a workspace in iManage or NetDocuments, and every document has a profile: client, matter, type and author.
- **Fund legal teams** usually file by fund family, then entity, then category. Executed PDFs are kept apart from drafts, and closing sets stay together.
- **Recommended layout:**
  - A few libraries split along permission lines:
    - Management Company;
    - Funds;
    - Investor Documents (subscription documents and side letters, restricted);
    - Portfolio.
  - Shallow folders, with metadata doing the real work.
  - Typical categories: Formation, Governing Documents, Offering, Investor, Consents & Minutes, Regulatory, Tax, Banking & KYC, Service Agreements.

**Metadata columns**
- Entity (multi-value; a lookup or managed metadata)
- Fund family
- Document Type (a managed term set)
- Document Date or Effective Date
- Status: Draft, Executed, Filed, Superseded, Terminated
- Version label, e.g. "A&R 2024"
- Investor or counterparty code
- Confidentiality
- Expiry date
- Index ID (the matching record in your system)

**SharePoint limits that shape the design**
- **Path length:** the folder path plus file name is capped at 400 characters. Keep folders shallow and names short.
- **Large libraries:** a view over more than 5,000 items needs indexed columns. Index Entity, Type, Status and Date.
- **Permissions:**
  - A library holds up to 30 million items.
  - Permissions can't be broken below a container that holds more than 100,000 items.
  - Microsoft recommends no more than 5,000 uniquely permissioned items.
  - So set permissions per library or site, not per file.
- **Versions:**
  - SharePoint can trim version history automatically or by a count limit, so it is not a legal version record.
  - Save each executed version as its own file, or apply record labels.
- **Links:**
  - Ordinary path links break when a file is renamed or moved.
  - Option one: turn on the Document ID service. Its `DocIdRedir.aspx?ID=…` links survive moves within a site collection.
  - Option two: store Microsoft Graph IDs and look up the current link when needed.
  - Either way, a copied file gets a new ID.
- **Search:**
  - The Microsoft Graph search API (`/search/query`, over files or list items, with KQL queries and path scoping) returns each file's web link.
  - To filter on your own columns, map them to searchable "managed properties" such as RefinableString.
  - Graph uses only the tenant-wide search setup.

**What the index front end should offer**
1. Search across titles and metadata, with full-text search through Graph. Filters: entity (with an "include sub-entities" option that follows ownership), type, status, date range and fund.
2. A "Documents" tab on each entity page, grouped by category. The current executed version comes first; superseded versions are collapsed.
3. A **missing-documents report** driven by rules per entity type and registration. The same report flags stale items, e.g. good standing older than 30 days, incumbency older than 12 months, or a lapsed LEI.
4. Links that open in SharePoint, plus preview and copy-link. Use the user's own sign-in so people see only files they can already open.
5. One document linked to many entities. Documents also serve as evidence for calendar items and appointments.
6. Reconciliation in both directions: files in SharePoint that aren't indexed, and index rows whose link is broken.

---

## 5. Sample fund complex (fictional)

Everything below is fictional, including names, numbers, agents and URLs. "Quillhaven" returned no web matches.

```json
{
  "meta": {
    "as_of": "2026-10-25",
    "notes": "Fictional. EINs follow 00-00000NN; LEI, CRD, SEC file, CIMA, Cayman and GIIN numbers are placeholders. Percent = share of total commitments at final close unless noted."
  },
  "people": [
    { "id": "P01", "name": "Daniel R. Okafor", "summary": "Founder and Managing Partner", "location": "New York, NY" },
    { "id": "P02", "name": "Priya Natarajan-Hale", "summary": "Managing Partner", "location": "New York, NY" },
    { "id": "P03", "name": "Thomas K. Lindqvist", "summary": "Partner, Head of Credit (former CCO)", "location": "New York, NY" },
    { "id": "P04", "name": "Rebecca A. Moretti", "summary": "CFO and Chief Compliance Officer", "location": "New York, NY" },
    { "id": "P05", "name": "Jonathan S. Ferraro", "summary": "General Counsel and Secretary", "location": "New York, NY" },
    { "id": "P06", "name": "Fiona MacAllister", "summary": "Independent professional director", "location": "George Town, Grand Cayman" }
  ],
  "registered_agents": [
    { "id": "RA1", "name": "Wilmington Harbor Agent Services, LLC", "jurisdiction": "Delaware", "address": "Wilmington, DE (fictional)" },
    { "id": "RA2", "name": "Christina River Corporate Agents, Inc.", "jurisdiction": "Delaware", "address": "Wilmington, DE (fictional)" },
    { "id": "RO1", "name": "Seven Mile Corporate Services Ltd.", "jurisdiction": "Cayman Islands", "address": "George Town, Grand Cayman (fictional)" },
    { "id": "NYSOS", "name": "New York Secretary of State (statutory agent for service of process)", "jurisdiction": "New York" }
  ],
  "entities": [
    { "id": "E01", "legal_name": "Quillhaven Partners Holdings, LLC", "type": "Limited liability company", "jurisdiction": "Delaware", "role": "Sponsor holding company", "formed": "2014-02-20", "fye": "12-31", "status": "Active", "ein": "00-0000001", "agent": "RA1", "purpose": "Holds the founders' interests in the management company." },
    { "id": "E02", "legal_name": "Quillhaven Capital Management, LLC", "former_names": [{ "name": "Quillhaven Advisors, LLC", "from": "2014-03-12", "to": "2016-01-03" }], "type": "Limited liability company", "jurisdiction": "Delaware", "role": "Management company; SEC-registered investment adviser", "formed": "2014-03-12", "fye": "12-31", "status": "Active", "ein": "00-0000002", "lei": { "code": "FAKELEI0000000000002", "next_renewal": "2027-03-10" }, "ids": { "sec_file": "801-000001 (fictional)", "crd": "000001 (fictional)" }, "agent": "RA1", "foreign_qualifications": [{ "state": "New York", "date": "2014-04-01", "status": "Active", "agent": "NYSOS" }], "purpose": "Investment adviser to all Quillhaven funds." },
    { "id": "E03", "legal_name": "Quillhaven Fund III GP, LLC", "type": "Limited liability company", "jurisdiction": "Delaware", "role": "General partner (Fund III, Fund III-A, AIV-1, Co-Invest)", "formed": "2023-10-02", "fye": "12-31", "status": "Active", "ein": "00-0000003", "agent": "RA1", "purpose": "General partner; carried interest vehicle for the Fund III team." },
    { "id": "E04", "legal_name": "Quillhaven Fund III GP (Cayman), Ltd.", "type": "Exempted company", "jurisdiction": "Cayman Islands", "role": "General partner (Offshore feeder)", "formed": "2023-10-16", "fye": "12-31", "status": "Active", "ein": null, "ids": { "cayman_reg": "CI-EC-000001 (fictional)" }, "authorized_capital": "US$50,000 in 50,000 ordinary shares of US$1.00; 1 share issued", "agent": "RO1", "purpose": "Qualifying Cayman general partner of the Offshore feeder." },
    { "id": "E05", "legal_name": "Quillhaven Capital Partners III, L.P.", "short_name": "Fund III", "type": "Limited partnership", "jurisdiction": "Delaware", "role": "Main fund", "formed": "2023-10-05", "fye": "12-31", "status": "Active (investing)", "ein": "00-0000004", "lei": { "code": "FAKELEI0000000000005", "next_renewal": "2026-11-14" }, "agent": "RA1", "first_close": "2024-03-28", "final_close": "2025-09-30", "commitments_usd": 1050000000, "investment_period_end": "2029-03-28", "purpose": "Control and significant-minority investments in U.S. lower-middle-market companies." },
    { "id": "E06", "legal_name": "Quillhaven Capital Partners III-A, L.P.", "short_name": "Fund III-A", "type": "Limited partnership", "jurisdiction": "Delaware", "role": "Parallel fund", "formed": "2023-10-05", "fye": "12-31", "status": "Active (investing)", "ein": "00-0000005", "agent": "RA1", "commitments_usd": 150000000, "purpose": "Parallel vehicle for investors with tax or regulatory needs; invests pro rata with Fund III (87.5% / 12.5%)." },
    { "id": "E07", "legal_name": "Quillhaven Capital Partners III (Offshore), L.P.", "short_name": "Offshore Feeder", "type": "Exempted limited partnership", "jurisdiction": "Cayman Islands", "role": "Feeder (invests all assets into Fund III)", "formed": "2023-10-20", "fye": "12-31", "status": "Active", "ein": "00-0000006", "ids": { "cayman_reg": "CI-ELP-000001 (fictional)", "cima": "PF-000001 (fictional)", "giin": "000000.00000.ME.136 (fictional)" }, "lei": { "code": "FAKELEI0000000000007", "next_renewal": "2027-04-02" }, "agent": "RO1", "commitments_usd": 250000000, "aml_officers": "AMLCO: P04; MLRO and deputy MLRO: provided by the fund administrator" },
    { "id": "E08", "legal_name": "Quillhaven Capital Partners III AIV-1, L.P.", "short_name": "AIV-1", "type": "Limited partnership", "jurisdiction": "Delaware", "role": "Alternative investment vehicle", "formed": "2025-02-11", "fye": "12-31", "status": "Active", "ein": "00-0000007", "agent": "RA1", "purpose": "Holds the Tessellate investment through a corporate blocker." },
    { "id": "E09", "legal_name": "QCP III Tessellate Blocker, Inc.", "short_name": "Blocker", "type": "Corporation", "jurisdiction": "Delaware", "role": "Blocker", "formed": "2025-02-12", "fye": "12-31", "status": "Active", "ein": "00-0000008", "agent": "RA1", "authorized_shares": "1,000 common, $0.001 par; 100 issued", "purpose": "Shields tax-exempt and non-U.S. investors from UBTI/ECI from a pass-through portfolio company." },
    { "id": "E10", "legal_name": "Quillhaven III Co-Invest (Pellbrook), L.P.", "short_name": "Co-Invest", "type": "Limited partnership", "jurisdiction": "Delaware", "role": "Co-investment vehicle", "formed": "2026-05-20", "fye": "12-31", "status": "Active (offering open)", "ein": "00-0000009", "agent": "RA1", "commitments_usd": 60000000, "first_sale": "2026-06-15" },
    { "id": "E11", "legal_name": "Pellbrook Logistics Holdings, Inc.", "type": "Corporation", "jurisdiction": "Delaware", "role": "Portfolio company", "formed": "2024-05-30", "acquired": "2024-06-28", "fye": "12-31", "status": "Active", "ein": "00-0000010", "agent": "RA2", "foreign_qualifications": [{ "state": "Texas", "date": "2024-07-15" }, { "state": "California", "date": "2024-08-02" }] },
    { "id": "E12", "legal_name": "Orrin Valley Software, Inc.", "type": "Corporation", "jurisdiction": "Delaware", "role": "Portfolio company", "formed": "2011-08-22", "acquired": "2024-11-07", "fye": "12-31", "status": "Active", "ein": "00-0000011", "agent": "RA2" },
    { "id": "E13", "legal_name": "Tessellate Dental Partners Holdco, LLC", "type": "Limited liability company", "jurisdiction": "Delaware", "role": "Portfolio company (pass-through)", "formed": "2025-02-20", "acquired": "2025-03-14", "fye": "12-31", "status": "Active", "ein": "00-0000012", "agent": "RA2" },
    { "id": "E14", "legal_name": "Corvane Specialty Chemicals Holdings, LLC", "type": "Limited liability company", "jurisdiction": "Delaware", "role": "Portfolio company", "formed": "2026-01-28", "acquired": "2026-02-20", "fye": "12-31", "status": "Active", "ein": "00-0000013", "agent": "RA2" }
  ],
  "investor_groups": [
    { "id": "G01", "name": "Fund III: U.S. public pension plans", "commitment_usd": 320000000 },
    { "id": "G02", "name": "Fund III: Endowments and foundations", "commitment_usd": 150000000 },
    { "id": "G03", "name": "Fund III: Insurance companies", "commitment_usd": 140000000 },
    { "id": "G04", "name": "Fund III: Family offices and high-net-worth individuals", "commitment_usd": 95000000 },
    { "id": "G05", "name": "Fund III: Funds of funds", "commitment_usd": 83000000 },
    { "id": "G06", "name": "Fund III-A: U.S. corporate (ERISA) pension plans", "commitment_usd": 110000000 },
    { "id": "G07", "name": "Fund III-A: Non-U.S. sovereign wealth fund", "commitment_usd": 40000000 },
    { "id": "G08", "name": "Offshore: Non-U.S. institutional investors", "commitment_usd": 170000000 },
    { "id": "G09", "name": "Offshore: U.S. tax-exempt investors", "commitment_usd": 80000000 },
    { "id": "G10", "name": "Co-Invest: Three Fund III limited partners", "commitment_usd": 59400000 },
    { "id": "G11", "name": "AIV-1: Fund III partners (pro rata)" },
    { "id": "G12", "name": "AIV-1: Fund III-A partners (pro rata)" },
    { "id": "X11", "name": "Pellbrook management and other holders (not tracked)" },
    { "id": "X12", "name": "Orrin Valley founders and employees (not tracked)" },
    { "id": "X13", "name": "Tessellate founding dentists, rollover (not tracked)" },
    { "id": "X14", "name": "Corvane management and seller rollover (not tracked)" }
  ],
  "ownership": [
    { "holder": "P01", "entity": "E01", "interest": "Class A units", "pct": 55.0, "from": "2014-02-20", "to": "2015-12-31" },
    { "holder": "P02", "entity": "E01", "interest": "Class A units", "pct": 45.0, "from": "2014-02-20", "to": "2015-12-31" },
    { "holder": "P01", "entity": "E01", "interest": "Class A units", "pct": 45.0, "from": "2016-01-01" },
    { "holder": "P02", "entity": "E01", "interest": "Class A units", "pct": 35.0, "from": "2016-01-01" },
    { "holder": "P03", "entity": "E01", "interest": "Class A units", "pct": 20.0, "from": "2016-01-01" },
    { "holder": "E01", "entity": "E02", "interest": "Sole member", "pct": 100.0, "from": "2014-03-12" },
    { "holder": "P01", "entity": "E03", "interest": "Membership interest", "pct": 50.0, "from": "2023-10-02", "to": "2024-03-27" },
    { "holder": "P02", "entity": "E03", "interest": "Membership interest", "pct": 50.0, "from": "2023-10-02", "to": "2024-03-27" },
    { "holder": "P01", "entity": "E03", "interest": "Class A (voting) units", "pct": 40.0, "from": "2024-03-28" },
    { "holder": "P02", "entity": "E03", "interest": "Class A (voting) units", "pct": 30.0, "from": "2024-03-28" },
    { "holder": "P03", "entity": "E03", "interest": "Class B (non-voting) units", "pct": 20.0, "from": "2024-03-28" },
    { "holder": "P04", "entity": "E03", "interest": "Class B (non-voting) units", "pct": 5.0, "from": "2024-03-28" },
    { "holder": "P05", "entity": "E03", "interest": "Class B (non-voting) units", "pct": 5.0, "from": "2024-03-28" },
    { "holder": "E03", "entity": "E04", "interest": "Ordinary shares (1 share)", "pct": 100.0, "from": "2023-10-16" },
    { "holder": "E03", "entity": "E05", "interest": "General partner interest", "commitment_usd": 12000000, "pct": 1.14, "from": "2024-03-28" },
    { "holder": "G01", "entity": "E05", "interest": "LP interest", "commitment_usd": 320000000, "pct": 30.48 },
    { "holder": "G02", "entity": "E05", "interest": "LP interest", "commitment_usd": 150000000, "pct": 14.29 },
    { "holder": "G03", "entity": "E05", "interest": "LP interest", "commitment_usd": 140000000, "pct": 13.33 },
    { "holder": "G04", "entity": "E05", "interest": "LP interest", "commitment_usd": 95000000, "pct": 9.05 },
    { "holder": "G05", "entity": "E05", "interest": "LP interest", "commitment_usd": 83000000, "pct": 7.90 },
    { "holder": "E07", "entity": "E05", "interest": "LP interest (feeder)", "commitment_usd": 250000000, "pct": 23.81 },
    { "holder": "E03", "entity": "E06", "interest": "General partner interest (non-economic)", "pct": 0.0 },
    { "holder": "G06", "entity": "E06", "interest": "LP interest", "commitment_usd": 110000000, "pct": 73.33 },
    { "holder": "G07", "entity": "E06", "interest": "LP interest", "commitment_usd": 40000000, "pct": 26.67 },
    { "holder": "E04", "entity": "E07", "interest": "General partner interest (non-economic)", "pct": 0.0 },
    { "holder": "G08", "entity": "E07", "interest": "LP interest", "commitment_usd": 170000000, "pct": 68.00 },
    { "holder": "G09", "entity": "E07", "interest": "LP interest", "commitment_usd": 80000000, "pct": 32.00 },
    { "holder": "E03", "entity": "E08", "interest": "General partner interest (non-economic)", "pct": 0.0, "from": "2025-02-11" },
    { "holder": "G11", "entity": "E08", "interest": "LP interest", "pct": 87.5, "from": "2025-03-14" },
    { "holder": "G12", "entity": "E08", "interest": "LP interest", "pct": 12.5, "from": "2025-03-14" },
    { "holder": "E08", "entity": "E09", "interest": "Common stock (100 shares)", "pct": 100.0, "from": "2025-02-12" },
    { "holder": "E03", "entity": "E10", "interest": "General partner interest", "commitment_usd": 600000, "pct": 1.0, "from": "2026-06-15" },
    { "holder": "G10", "entity": "E10", "interest": "LP interest", "commitment_usd": 59400000, "pct": 99.0, "from": "2026-06-15" },
    { "holder": "E05", "entity": "E11", "interest": "Common stock", "pct": 59.5, "from": "2024-06-28", "to": "2026-06-14" },
    { "holder": "E06", "entity": "E11", "interest": "Common stock", "pct": 8.5, "from": "2024-06-28", "to": "2026-06-14" },
    { "holder": "X11", "entity": "E11", "interest": "Common stock", "pct": 32.0, "from": "2024-06-28", "to": "2026-06-14" },
    { "holder": "E05", "entity": "E11", "interest": "Common stock", "pct": 52.5, "from": "2026-06-15" },
    { "holder": "E06", "entity": "E11", "interest": "Common stock", "pct": 7.5, "from": "2026-06-15" },
    { "holder": "E10", "entity": "E11", "interest": "Common stock", "pct": 12.0, "from": "2026-06-15" },
    { "holder": "X11", "entity": "E11", "interest": "Common stock", "pct": 28.0, "from": "2026-06-15" },
    { "holder": "E05", "entity": "E12", "interest": "Series A preferred and common", "pct": 63.0, "from": "2024-11-07" },
    { "holder": "E06", "entity": "E12", "interest": "Series A preferred and common", "pct": 9.0, "from": "2024-11-07" },
    { "holder": "X12", "entity": "E12", "interest": "Common stock", "pct": 28.0, "from": "2024-11-07" },
    { "holder": "E09", "entity": "E13", "interest": "Class A units", "pct": 66.0, "from": "2025-03-14" },
    { "holder": "X13", "entity": "E13", "interest": "Class B units", "pct": 34.0, "from": "2025-03-14" },
    { "holder": "E05", "entity": "E14", "interest": "Class A units", "pct": 56.0, "from": "2026-02-20" },
    { "holder": "E06", "entity": "E14", "interest": "Class A units", "pct": 8.0, "from": "2026-02-20" },
    { "holder": "X14", "entity": "E14", "interest": "Class B units", "pct": 36.0, "from": "2026-02-20" }
  ],
  "positions": [
    { "person": "P01", "entity": "E01", "title": "Managing Member", "start": "2014-02-20" },
    { "person": "P02", "entity": "E01", "title": "Managing Member", "start": "2014-02-20" },
    { "person": "P01", "entity": "E02", "title": "Chief Executive Officer", "start": "2014-03-12", "source_doc": "D02" },
    { "person": "P02", "entity": "E02", "title": "President", "start": "2014-03-12", "source_doc": "D02" },
    { "person": "P03", "entity": "E02", "title": "Chief Compliance Officer", "start": "2014-03-12", "end": "2018-12-31" },
    { "person": "P03", "entity": "E02", "title": "Partner, Head of Credit", "start": "2016-01-01" },
    { "person": "P04", "entity": "E02", "title": "Chief Financial Officer", "start": "2017-06-01" },
    { "person": "P04", "entity": "E02", "title": "Chief Compliance Officer", "start": "2019-01-01" },
    { "person": "P05", "entity": "E02", "title": "General Counsel and Secretary", "start": "2020-09-14" },
    { "person": "P01", "entity": "E03", "title": "Managing Member", "start": "2023-10-02", "source_doc": "D06" },
    { "person": "P02", "entity": "E03", "title": "Managing Member", "start": "2023-10-02", "source_doc": "D06" },
    { "person": "P04", "entity": "E03", "title": "Treasurer", "start": "2023-10-02", "source_doc": "D06" },
    { "person": "P05", "entity": "E03", "title": "Vice President and Secretary", "start": "2023-10-02", "source_doc": "D06" },
    { "person": "P01", "entity": "E04", "title": "Director", "start": "2023-10-16", "source_doc": "D17" },
    { "person": "P03", "entity": "E04", "title": "Director", "start": "2023-10-16", "end": "2024-06-30", "source_doc": "D17" },
    { "person": "P06", "entity": "E04", "title": "Independent Director", "start": "2024-07-01", "source_doc": "Board resolutions 2024-06-28 (not indexed)", "register_filed": "2024-07-15" },
    { "person": "P04", "entity": "E07", "title": "AML Compliance Officer", "start": "2024-04-05" },
    { "person": "P01", "entity": "E09", "title": "Director", "start": "2025-02-12" },
    { "person": "P03", "entity": "E09", "title": "Director and President", "start": "2025-02-12" },
    { "person": "P04", "entity": "E09", "title": "Treasurer", "start": "2025-02-12" },
    { "person": "P05", "entity": "E09", "title": "Secretary", "start": "2025-02-12" },
    { "person": "P01", "entity": "E11", "title": "Director", "start": "2024-06-28" },
    { "person": "P02", "entity": "E12", "title": "Director (Chair)", "start": "2024-11-07" },
    { "person": "P03", "entity": "E13", "title": "Manager (Board of Managers)", "start": "2025-03-14" },
    { "person": "P02", "entity": "E14", "title": "Manager (Board of Managers)", "start": "2026-02-20" }
  ],
  "signing_authority": [
    { "id": "SA01", "entities": ["E05", "E06", "E08", "E10"], "acting_through": "E03", "category": "Capital call and distribution notices", "signers": "Any one of P01, P02, P04", "basis": "D06", "from": "2024-03-28" },
    { "id": "SA02", "entities": ["E05", "E06", "E08", "E10"], "acting_through": "E03", "category": "Acquisition and disposition agreements", "rule": "Up to $75,000,000: any one of P01, P02. Above $75,000,000: P01 and P02 jointly", "basis": "D06", "from": "2024-03-28" },
    { "id": "SA03", "entities": ["E05", "E06"], "acting_through": "E03", "category": "Side letters and MFN elections", "signers": "Any one of P01, P02, after written approval of P05", "basis": "D06" },
    { "id": "SA04", "entities": ["E02"], "category": "Regulatory filings (Form ADV, Form PF, Form D, CFTC affirmations)", "signers": "Any one of P04, P05", "basis": "D02" },
    { "id": "SA05", "entities": ["E02"], "category": "Vendor and service contracts", "rule": "Up to $250,000: P04. Above: P01 or P02", "basis": "D02" },
    { "id": "SA06", "entities": ["E05"], "acting_through": "E03", "category": "Bank wire release", "rule": "Any two of P01, P02, P04, P05; above $5,000,000 one signer must be P01 or P02", "basis": "D22" },
    { "id": "SA07", "entities": ["E07"], "acting_through": "E04", "category": "All documents, including CIMA and Registrar filings", "signers": "Any one director (P01 or P06)", "basis": "D17" },
    { "id": "SA08", "entities": ["E09"], "category": "Tax returns, banking and routine filings", "signers": "President (P03) or Treasurer (P04); share issuances, borrowing and M&A need board approval", "basis": "Bylaws (missing)" }
  ],
  "signature_block_example": "QUILLHAVEN CAPITAL PARTNERS III, L.P.\nBy: Quillhaven Fund III GP, LLC, its general partner\nBy: ______________________\nName: Daniel R. Okafor\nTitle: Managing Member",
  "registrations": [
    { "id": "R01", "entity": "E02", "type": "SEC investment adviser registration", "number": "801-000001 (fictional)", "effective": "2015-07-15", "status": "Active", "last_annual_adv": "2026-03-27" },
    { "id": "R02", "entity": "E02", "type": "Form PF filer (private equity fund adviser, annual)", "status": "Active" },
    { "id": "R03", "entity": "E02", "type": "New York foreign LLC (biennial statement)", "effective": "2014-04-01", "last_filed": "2026-04-09" },
    { "id": "R04", "entity": "E05", "type": "Form D, Rule 506(b)", "file_no": "021-000001 (fictional)", "first_sale": "2024-03-28", "filings": ["2024-04-08 initial", "2025-04-04 amendment"], "offering_terminated": "2025-09-30" },
    { "id": "R05", "entity": "E06", "type": "Form D, Rule 506(b)", "first_sale": "2024-03-28", "filings": ["2024-04-10 initial", "2025-04-04 amendment"], "offering_terminated": "2025-09-30" },
    { "id": "R06", "entity": "E07", "type": "Form D, Rule 506(b) (U.S. investors)", "first_sale": "2024-03-28", "filings": ["2024-04-10 initial", "2025-04-04 amendment"], "offering_terminated": "2025-09-30" },
    { "id": "R07", "entity": "E10", "type": "Form D, Rule 506(b)", "first_sale": "2026-06-15", "filings": ["2026-06-26 initial"], "offering_status": "Open" },
    { "id": "R08", "entity": "E07", "type": "CIMA private fund (Private Funds Act)", "number": "PF-000001 (fictional)", "effective": "2024-04-05" },
    { "id": "R09", "entity": "E07", "type": "Cayman TIA FATCA/CRS registration", "effective": "2025-01-20" },
    { "id": "R10", "entities": ["E05", "E06", "E07"], "type": "CFTC Rule 4.13(a)(3) exemption (NFA)", "claimed": "2024-03-25", "affirmed": ["2025-02-24", "2026-02-27"] },
    { "id": "R11", "entity": "all", "type": "FinCEN BOI", "status": "Not required: U.S. entities exempt; Cayman entities not registered in any U.S. state" }
  ],
  "compliance_calendar_sample": [
    { "due": "2026-05-20", "status": "Done", "item": "Delaware annual tax, tax year 2025, $300 each", "entities": ["E01", "E02", "E03", "E05", "E06", "E08"] },
    { "due": "2026-11-14", "item": "LEI renewal", "entities": ["E05"] },
    { "due": "2027-01-15", "item": "CIMA annual fee (CI$4,125 at 2026 rate; single REEFS payment from 2027)", "entities": ["E07"] },
    { "due": "2027-01 (no penalty if filed before 2027-04-01)", "item": "Cayman annual return: ELP US$1,586; exempted company US$1,129", "entities": ["E07", "E04"] },
    { "due": "2027-03-01", "item": "Delaware annual report ($50) and franchise tax (minimum $175, authorized-shares method)", "entities": ["E09"] },
    { "due": "2027-03-01", "item": "CFTC 4.13(a)(3) annual affirmation", "entities": ["E05", "E06", "E07"] },
    { "due": "2027-03-10", "item": "LEI renewal", "entities": ["E02"] },
    { "due": "2027-03-31", "item": "Form ADV annual updating amendment (90 days after FYE)", "entities": ["E02"] },
    { "due": "2027-04-30", "item": "Form PF annual update and Form ADV Part 2 delivery (120 days after FYE)", "entities": ["E02"] },
    { "due": "2027-06-01", "item": "Delaware annual tax, tax year 2026, $400 each ($2,800 total)", "entities": ["E01", "E02", "E03", "E05", "E06", "E08", "E10"] },
    { "due": "2027-06-25", "item": "Form D annual amendment, only if the offering is still open (anniversary 2027-06-26 falls on a Saturday)", "entities": ["E10"] },
    { "due": "2027-06-30", "item": "CIMA audited accounts and Fund Annual Return for FY2026; CRS report and CRS compliance form", "entities": ["E07"] },
    { "due": "2027-07-31", "item": "Cayman FATCA report (a Saturday; confirm the TIA's practice)", "entities": ["E07"] },
    { "due": "2028-04", "item": "New York LLC biennial statement ($9)", "entities": ["E02"] },
    { "due": null, "status": "Not applicable", "item": "Form D amendment for E05, E06 and E07 (offerings ended 2025-09-30); 13F (no 13(f) securities); BOI (exempt)" }
  ],
  "required_document_rules": {
    "Delaware LP": ["Certificate of Limited Partnership", "Executed Limited Partnership Agreement (latest)"],
    "Delaware LLC": ["Certificate of Formation", "Executed LLC Agreement (latest)"],
    "Delaware corporation": ["Certificate of Incorporation", "Bylaws", "Organizational consent"],
    "Cayman ELP": ["Certificate of Registration", "Executed ELP Agreement", "CIMA certificate (if CIMA-registered)"],
    "Cayman exempted company": ["Certificate of Incorporation and Memorandum & Articles", "Register of directors and officers"],
    "SEC-registered adviser": ["Current-year Form ADV"],
    "Each Form D filing": ["EDGAR copy of the filing"],
    "Each director appointment": ["Appointing resolution or consent"],
    "Portfolio companies": "Excluded from these checks"
  },
  "documents": [
    { "id": "D01", "title": "Certificate of Formation", "type": "Certificate of Formation", "date": "2014-03-12", "status": "Filed", "entities": ["E02"], "url": "https://contoso.sharepoint.com/sites/FundLegal/Shared%20Documents/Management%20Company/Formation/QCM%20Certificate%20of%20Formation%20(2014-03-12).pdf" },
    { "id": "D02", "title": "Amended and Restated LLC Agreement", "type": "LLC Agreement", "date": "2021-01-01", "status": "Executed", "version": "A&R 2021", "entities": ["E02", "E01"], "url": "https://contoso.sharepoint.com/sites/FundLegal/Shared%20Documents/Management%20Company/Governing%20Documents/QCM%20A%26R%20LLC%20Agreement%20(Executed%202021-01-01).pdf" },
    { "id": "D03", "title": "Form ADV Annual Updating Amendment 2026 (Parts 1 and 2A)", "type": "Form ADV", "date": "2026-03-27", "status": "Filed", "version": "2026", "entities": ["E02"], "url": "https://contoso.sharepoint.com/sites/FundLegal/Shared%20Documents/Management%20Company/Regulatory/Form%20ADV/Form%20ADV%202026%20(Filed%202026-03-27).pdf" },
    { "id": "D04", "title": "Form ADV Annual Updating Amendment 2025", "type": "Form ADV", "date": "2025-03-28", "status": "Superseded", "version": "2025", "superseded_by": "D03", "entities": ["E02"], "url": "https://contoso.sharepoint.com/sites/FundLegal/Shared%20Documents/Management%20Company/Regulatory/Form%20ADV/Form%20ADV%202025%20(Filed%202025-03-28).pdf" },
    { "id": "D05", "title": "Certificate of Formation, Fund III GP", "type": "Certificate of Formation", "date": "2023-10-02", "status": "Filed", "entities": ["E03"], "url": "https://contoso.sharepoint.com/sites/FundLegal/Shared%20Documents/Fund%20III/GP/Certificate%20of%20Formation%20-%20Fund%20III%20GP%20(2023-10-02).pdf" },
    { "id": "D06", "title": "Amended and Restated LLC Agreement, Fund III GP", "type": "LLC Agreement", "date": "2024-03-28", "status": "Executed", "version": "A&R 2024", "entities": ["E03"], "url": "https://contoso.sharepoint.com/sites/FundLegal/Shared%20Documents/Fund%20III/GP/Fund%20III%20GP%20LLC%20Agreement%20(Executed%202024-03-28).pdf" },
    { "id": "D07", "title": "Certificate of Limited Partnership, Fund III", "type": "Certificate of Limited Partnership", "date": "2023-10-05", "status": "Filed", "entities": ["E05"], "url": "https://contoso.sharepoint.com/sites/FundLegal/Shared%20Documents/Fund%20III/Formation/Certificate%20of%20Limited%20Partnership%20(2023-10-05).pdf" },
    { "id": "D08", "title": "Amended and Restated Limited Partnership Agreement, Fund III", "type": "Limited Partnership Agreement", "date": "2024-03-28", "status": "Executed", "version": "A&R 2024", "entities": ["E05", "E03"], "url": "https://contoso.sharepoint.com/sites/FundLegal/Shared%20Documents/Fund%20III/Governing%20Documents/LPA%20(Executed).pdf" },
    { "id": "D09", "title": "Amended and Restated Limited Partnership Agreement, Fund III-A", "type": "Limited Partnership Agreement", "date": "2024-03-28", "status": "Executed", "version": "A&R 2024", "entities": ["E06", "E03"], "url": "https://contoso.sharepoint.com/sites/FundLegal/Shared%20Documents/Fund%20III/Governing%20Documents/Fund%20III-A%20LPA%20(Executed).pdf" },
    { "id": "D10", "title": "Confidential Private Placement Memorandum (with Cayman supplement)", "type": "Private Placement Memorandum", "date": "2024-01-15", "status": "Final", "entities": ["E05", "E06", "E07"], "url": "https://contoso.sharepoint.com/sites/FundLegal/Shared%20Documents/Fund%20III/Offering%20Documents/Fund%20III%20PPM%20(Final%202024-01-15).pdf" },
    { "id": "D11", "title": "Subscription Agreement (Form)", "type": "Subscription Agreement", "date": "2024-01-15", "status": "Form", "entities": ["E05", "E06", "E07"], "url": "https://contoso.sharepoint.com/sites/FundLegal/Shared%20Documents/Fund%20III/Offering%20Documents/Subscription%20Agreement%20(Form%202024-01-15).docx" },
    { "id": "D12", "title": "Side Letter, LP-014 (U.S. public pension plan)", "type": "Side Letter", "date": "2024-03-28", "status": "Executed", "entities": ["E05"], "url": "https://contoso.sharepoint.com/sites/FundLegal/Shared%20Documents/Fund%20III/Side%20Letters/Side%20Letter%20-%20LP-014%20(Executed%202024-03-28).pdf" },
    { "id": "D13", "title": "Side Letter, LP-031 (non-U.S. sovereign wealth fund)", "type": "Side Letter", "date": "2024-06-30", "status": "Executed", "entities": ["E06"], "url": "https://contoso.sharepoint.com/sites/FundLegal/Shared%20Documents/Fund%20III/Side%20Letters/Side%20Letter%20-%20LP-031%20(Executed%202024-06-30).pdf" },
    { "id": "D14", "title": "Investment Management Agreement", "type": "Investment Management Agreement", "date": "2024-03-28", "status": "Executed", "entities": ["E02", "E05", "E06", "E07", "E03", "E04"], "url": "https://contoso.sharepoint.com/sites/FundLegal/Shared%20Documents/Fund%20III/Service%20Agreements/Investment%20Management%20Agreement%20(Executed%202024-03-28).pdf" },
    { "id": "D15", "title": "Form D (initial notice), Fund III", "type": "Form D", "date": "2024-04-08", "status": "Filed", "entities": ["E05"], "url": "https://contoso.sharepoint.com/sites/FundLegal/Shared%20Documents/Fund%20III/Regulatory/Form%20D/Form%20D%20-%20Fund%20III%20(Filed%202024-04-08).pdf" },
    { "id": "D16", "title": "Form D/A (annual amendment), Fund III", "type": "Form D", "date": "2025-04-04", "status": "Filed", "version": "Amendment 1", "entities": ["E05"], "url": "https://contoso.sharepoint.com/sites/FundLegal/Shared%20Documents/Fund%20III/Regulatory/Form%20D/Form%20D-A%20-%20Fund%20III%20(Filed%202025-04-04).pdf" },
    { "id": "D17", "title": "Certificate of Incorporation and Memorandum & Articles, Cayman GP", "type": "Memorandum and Articles", "date": "2023-10-16", "status": "Filed", "entities": ["E04"], "url": "https://contoso.sharepoint.com/sites/FundLegal/Shared%20Documents/Fund%20III/Offshore%20Feeder/Cayman%20GP%20-%20Certificate%20of%20Incorporation%20and%20M%26A%20(2023-10-16).pdf" },
    { "id": "D18", "title": "Amended and Restated Exempted Limited Partnership Agreement, Offshore", "type": "Limited Partnership Agreement", "date": "2024-03-28", "status": "Executed", "version": "A&R 2024", "entities": ["E07", "E04"], "url": "https://contoso.sharepoint.com/sites/FundLegal/Shared%20Documents/Fund%20III/Offshore%20Feeder/Offshore%20ELP%20Agreement%20(Executed%202024-03-28).pdf" },
    { "id": "D19", "title": "CIMA Certificate of Registration (Private Fund)", "type": "Regulatory Certificate", "date": "2024-04-05", "status": "Filed", "entities": ["E07"], "url": "https://contoso.sharepoint.com/sites/FundLegal/Shared%20Documents/Fund%20III/Offshore%20Feeder/CIMA%20Certificate%20of%20Registration%20(2024-04-05).pdf" },
    { "id": "D20", "title": "Written Consent of the Managing Members: formation of AIV-1 and Blocker", "type": "Written Consent", "date": "2025-02-10", "status": "Executed", "entities": ["E03", "E05", "E06", "E08", "E09"], "url": "https://contoso.sharepoint.com/sites/FundLegal/Shared%20Documents/Fund%20III/Consents/GP%20Written%20Consent%20-%20AIV-1%20and%20Blocker%20(2025-02-10).pdf" },
    { "id": "D21", "title": "Certificate of Incorporation, Blocker", "type": "Certificate of Incorporation", "date": "2025-02-12", "status": "Filed", "entities": ["E09"], "url": "https://contoso.sharepoint.com/sites/FundLegal/Shared%20Documents/Fund%20III/AIV-1%20and%20Blocker/Blocker%20Certificate%20of%20Incorporation%20(2025-02-12).pdf" },
    { "id": "D22", "title": "Incumbency Certificate, Fund III GP", "type": "Incumbency Certificate", "date": "2026-06-10", "status": "Executed", "entities": ["E03", "E05", "E06", "E10"], "url": "https://contoso.sharepoint.com/sites/FundLegal/Shared%20Documents/Fund%20III/GP/Incumbency%20Certificate%20-%20Fund%20III%20GP%20(2026-06-10).pdf" },
    { "id": "D23", "title": "Limited Partnership Agreement, Co-Invest (Pellbrook)", "type": "Limited Partnership Agreement", "date": "2026-06-15", "status": "Executed", "entities": ["E10", "E03"], "url": "https://contoso.sharepoint.com/sites/FundLegal/Shared%20Documents/Fund%20III/Co-Invest%20Pellbrook/Co-Invest%20LPA%20(Executed%202026-06-15).pdf" },
    { "id": "D24", "title": "Form D (initial notice), Co-Invest (Pellbrook)", "type": "Form D", "date": "2026-06-26", "status": "Filed", "entities": ["E10"], "url": "https://contoso.sharepoint.com/sites/FundLegal/Shared%20Documents/Fund%20III/Co-Invest%20Pellbrook/Form%20D%20-%20Co-Invest%20(Filed%202026-06-26).pdf" }
  ],
  "deliberate_gaps_for_missing_documents_demo": [
    "E01: Certificate of Formation and LLC Agreement",
    "E04: register of directors; board resolutions appointing P06",
    "E06: Certificate of Limited Partnership; Form D copies",
    "E07: ELP Certificate of Registration; Form D copies",
    "E08: Certificate of Limited Partnership and LPA",
    "E09: Bylaws and organizational consent",
    "E10: Certificate of Limited Partnership",
    "All entities: no good standing certificate on file (the KYC pack flags this)"
  ]
}
```

**Built-in demo stories in the data:**
- **History:**
  - E01 and E03 ownership changes over time.
  - Pellbrook is diluted when the co-invest comes in on 2026-06-15.
  - The CCO hand-over from P03 to P04, and the Cayman director change.
- **Former name:** E02 was previously "Quillhaven Advisors, LLC".
- **Tax change:** Delaware tax moves from $300 (paid 2026) to $400 (due 2027).
- **Conditional deadlines:** Form D amendments due only for the open co-invest offering.
- **Missing documents:** the gaps list above.
- **Upcoming renewal:** E05's LEI renews on 2026-11-14.
- **Superseded version:** D04 is superseded by D03.

---

## Sources

**Delaware**
- https://corp.delaware.gov/frtax/
- https://corp.delaware.gov/alt-entitytaxinstructions/
- https://www.withum.com/resources/delaware-businesses-face-increased-annual-taxes-and-filing-costs/
- https://news.bloombergtax.com/daily-tax-report-state/delaware-increases-secretary-of-state-entity-fees-annual-taxes

**Cayman Islands**
- https://www.harneys.com/media/xnqlicfl/cayman-islands-private-fund-compliance-guide-2026.pdf
- https://www.ciregistry.ky/partnerships-register/exempted-limited-partnership/
- https://mourant.com/file-library/media---2025/mourant---cayman-regulatory-update---q1-2025.pdf
- https://www.cima.ky/revisions-to-fees-payable-by-regulated-mutual-funds-and-regulated-private-funds
- https://maples.com/knowledge/cayman-aeoi-2026-deadlines-and-regulatory-updates

**SEC**
- Form ADV General Instructions (SEC-hosted copy): https://www.sec.gov/files/rules/final/2016/ia-4509-appendix-a.pdf
- Form D rule (17 CFR 230.503): https://www.law.cornell.edu/cfr/text/17/230.503
- Form PF: https://www.sec.gov/files/formpf.pdf
- https://www.mofo.com/resources/insights/260915-form-pf-amendments-compliance-date-extension
- https://www.sec.gov/newsroom/press-releases/2025-119-sec-cftc-extend-form-pf-compliance-date-oct-1-2026
- Form 13F FAQ: https://www.sec.gov/rules-regulations/staff-guidance/division-investment-management-frequently-asked-questions/frequently-asked-questions-about-form-13f
- Form 13H: https://www.wilmerhale.com/en/insights/publications/sec-adopts-rule-requiring-large-trader-reporting-august-1-2011
- Brochure delivery: https://compliance.sewkis.com/wp-content/uploads/2026/04/2026-SKRC-Compliance-Calendar-Weeklies_April-28.pdf
- State notice filings: https://www.akingump.com/en/insights/alerts/annual-compliance-obligations-of-investment-funds-clients-2

**CFTC/NFA, FinCEN, CFIUS**
- https://www.nfa.futures.org/electronic-filing-systems/exemptions.html
- https://www.fincen.gov/boi
- https://www.gtlaw.com/en/insights/2026/8/fincen-final-rule-permanently-ends-beneficial-ownership-reporting-requirements-for-us-companies-and-us-persons
- https://www.mofo.com/resources/insights/260108-fincen-hits-pause-no-aml-rule-for-investment-advisers-until-2028
- https://www.law.cornell.edu/cfr/text/31/800.401

**States and LEI**
- https://dos.ny.gov/biennial-statements-business-corporations-and-limited-liability-companies
- https://webharvest.gov/congress115th/20190110143334/https://llcbizfile.sos.ca.gov
- https://comptroller.texas.gov/taxes/franchise/forms/2026-franchise.php
- https://www.gleif.org/en/newsroom/blog/the-power-of-transparency-a-closer-look-at-lei-renewal-rates

**Products**
- https://www.athennian.com/
- https://www.athennian.com/news/athennian-launches-ai-governed-platform-for-private-markets
- https://www.athennian.com/partners-resource-hub/imanage
- https://www.diligent.com/products/entities
- https://www.diligent.com/features/entities/organizational-chart-software-new
- https://cscglobal.com/service/entity-management/
- https://carta.com/learn/private-funds/structures/entity-management/
- https://support.carta.com/kb/guide/en/scope-of-services-carta-fund-formation-KDBdIOSQRG/Steps/3724897
- https://www.prnewswire.com/news-releases/mainstreet-acquires-capbase-to-build-the-first-small-business-operating-system-302572843.html
- https://www.mainstreetbusiness.com/
- https://www.ownr.co/integrations/clio

**SharePoint**
- https://learn.microsoft.com/en-us/office365/servicedescriptions/sharepoint-online-service-description/sharepoint-online-limits
- https://learn.microsoft.com/sharepoint/document-library-version-history-limits
- https://learn.microsoft.com/en-us/graph/search-concept-files
- https://support.microsoft.com/en-US/SharePoint/admin/enable-and-configure-unique-document-ids
- https://support.microsoft.com/office/use-filtering-to-modify-a-sharepoint-view-3d8efc52-0808-4731-8f9b-3dfaeacea3d4
- https://www.dmcinfo.com/our-work/sharepoint-document-management-solution-for-the-legal-industry/
