# The sample

The workbook a first launch opens is Calder Ridge, a fictional private fund manager, with its Fund III family. Everything in it is fictional. It is a log, like any workbook: [app/sample/calder-ridge.js](../app/sample/calder-ridge.js) holds 136 changes by three people (Jordan Alvarez, Rebecca A. Moretti and Jonathan S. Ferraro), from June 2024 to October 2026. So its History reads as a team's record would.

## What's in it

**Objects:**
- 17 entities: the funds (Fund III, the parallel Fund III-A, the Cayman feeder, AIV-1 and the Corvane co-invest), the GPs, the manager, the sponsor holding company, two blockers, three portfolio companies, and a BDC the manager advises.
- 7 people, and 5 investor groups.
- 2 service providers.
- 47 documents.

**Relations:** ownership (economic and voting percentages), general partners, membership (managing member or member), positions, signing authority (with capacity and evidence), investment adviser, registered agents, and what each document concerns.

Opened as of today, the chart has 885 entered records. The definitions work out 589 more, for 1,474 in all:
- **Control** (51) and **Affiliated Person** (289) under §2(a)(9) and §2(a)(3), with the statute's words beside each clause.
- The BDC's **Close Affiliates** (21) and its one **Remote Affiliate**, under §57.
- **Look-Through Ownership** (51), and whether **Ownership Adds Up**.
- **Private Fund**, **Investment Company**, **Tax Classification** and the **3(c)(1) Count**.
- **Deadlines:**
  - Delaware annual tax and franchise tax, each tax year its own;
  - Form ADV, Form PF and Form D;
  - CFTC 4.13(a)(3) affirmations;
  - LEI renewals;
  - the Cayman annual return and fee, audited accounts, CRS and FATCA.

  Each moves to the business day before a weekend where the rule says "on or before".
- **Checks:** formation documents and governing agreements on file, and **Capacity Held**. That one flags David R. Okafor, who signs through GP III without managing it.

## Views

| View | What it shows |
| --- | --- |
| Structure | The fund structure, with GP lines, percentages, an Offshore frame and a Key |
| 40 Act | The BDC's close and remote affiliates, in frames by kind |
| Fund III | The fund's own investors and holdings |
| Management and control | The sponsor entities, with their directors and officers as text in the boxes |
| Entities, Ownership, Dates, Documents | Tables |

Each chart view has a title, an as-of line and a Key on a 16:9 page.

## What to look at first

- **The status bar:** 2 overdue (AIV-1's Delaware tax, Fund III-A's LEI), 2 due soon, and 5 blanks where something is required.
- **Why it holds:** select the dashed Close Affiliate line from the Fund III Blocker to the BDC, and step down through the reason in the formula bar.
- **As of a day:** set the date to December 31, 2023. GP III is still the Cayman feeder's general partner; the change took effect on July 9, 2024.
- **History:** it lists every change by who and when. Pick one to see the chart as it stood, and undo it if you need to.

## How it's kept

The sample was converted from the earlier app's, and revised since by scripts that append changes through the Log API, never by editing past changes. The tests check its counts: [app/tests/core-test.html](../app/tests/core-test.html) and [engine-test.html](../app/tests/engine-test.html).
