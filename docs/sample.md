# The sample

The workbook a first launch opens is Calder Ridge, a fictional private fund manager, with its Fund III family. Everything in it is fictional. It is a log, like any workbook: [app/sample/calder-ridge.js](../app/sample/calder-ridge.js) holds 136 changes by three people (Jordan Alvarez, Rebecca A. Moretti and Jonathan S. Ferraro), from June 2024 to October 2026. So its History reads as a team's record would.

## What's in it

**Objects:**
- 17 entities: the funds (Fund III, the parallel Fund III-A, the Cayman feeder, AIV-1 and the Corvane co-invest), the GPs, the manager, the sponsor holding company, two blockers, three portfolio companies, a BDC the manager advises, and an outside investor in it, the pension plan.
- 7 people, and 5 investor groups.
- 3 service providers, the registered agents: Wilmington Harbor in Delaware, The Corporation Trust Company before it, and Seven Mile in the Cayman Islands.
- 59 documents, among them the formation document and governing agreement of each Calder Ridge entity, two stock certificates and a VCOC opinion.

**Relations:** ownership (economic and voting percentages), general partners, membership (managing member or member), positions, signing authority (with capacity), investment adviser, registered agents, what each document concerns, and what each evidences: one relation, Evidence, of a document and an ownership, a position or a signing authority. A merger is a relation too, of the entity merged and its one survivor; the sample records none. Who's responsible is one more, of a person and an entity or a date's own record, which no page draws: Jonathan S. Ferraro, General Counsel and Secretary, for the family's entities; Rebecca A. Moretti, the CFO, for AIV-1, the blockers and the sponsor holding company, which is where its tax is paid, and for Fund III-A's late LEI renewal, which she took over.

Jurisdiction offers every U.S. state and D.C., and the offshore and European jurisdictions a fund practice meets: the Cayman Islands, the British Virgin Islands, Bermuda, Jersey, Guernsey, Luxembourg, Ireland, the Netherlands, England and Wales, Singapore and Hong Kong. A registered agent is recorded one way, as a relation of a service provider and the jurisdiction it serves.

Opened as of November 3, 2026, the chart has 1,029 entered records. The definitions work out 610 more, for 1,639 in all:
- **Control** (51) and **Affiliated Person** (289) under §2(a)(9) and §2(a)(3), with the statute's words beside each clause.
- The BDC's **Close Affiliates** (21) and its one **Remote Affiliate**, under §57.
- **Look-Through Ownership** (51), and whether **Ownership Adds Up**.
- **Private Fund**, **Investment Company**, **Tax Classification** and the **3(c)(1) Count**.
- **ERISA Plan Assets** of each private fund, by the 25% test of its **Benefit Plan Percentage**, unless it has a VCOC opinion.
- **Deadlines:**
  - the Delaware tax of each tax year, a corporation's franchise tax or a partnership's or LLC's annual tax, from the year it was formed, each payment recorded at the year it settles;
  - Form ADV, Form PF and Form D;
  - CFTC 4.13(a)(3) affirmations;
  - LEI renewals, a year on from the anniversary renewed, or from a late renewal;
  - the Cayman annual return and fee, audited accounts, CRS and FATCA.

  Each moves to the business day before a weekend where the rule says "on or before".

  Each is owed only by an entity of the family: one whose Vehicle Type, which is required, is set and isn't Portfolio Company or Third Party, as the pension plan is. So a buyer, or an entity not yet typed, owes nothing tracked.
- **Checks**, definitions whose every ruled-out record is a problem: **Formation Document on File** and **Governing Agreement on File** for each entity of the family, whether **Ownership Adds Up**, **Percentages In Range** for every ownership, and **Capacity Held**. They flag four: David R. Okafor's four signing authorities through GP III, which he doesn't manage. **Good Standing** has a Check note too, at an entry typed by hand, so its "no" needs attention, in amber, and is counted among the errors: AIV-1's. Any other typed "no" is a plain grey X.
- **What doesn't change over time:** EIN, File Number, Fiscal Year End and LEI have Fixed notes, so typing over one corrects it, asking no day.

## Views

| View | What it shows |
| --- | --- |
| Structure | The fund structure, with GP lines, percentages and a Key |
| 40 Act | The BDC's close and remote affiliates, in frames by kind |
| Fund III | The fund's own investors and holdings |
| Management and control | The sponsor entities, with their directors and officers as text in the boxes |
| Entities, Ownership, Dates, Documents | Tables |

Each chart view has a title, an as-of line and a Key on a 16:9 page.

## What to look at first

- **The status bar:** 2 overdue (AIV-1's Delaware tax, Fund III-A's LEI), 5 errors (David R. Okafor signs where he holds no capacity, four times; AIV-1 isn't in good standing), 2 due soon, and 1 blank where something is required: the date of the email Okafor's presidency of the Manager rests on, which is kept blank to be found.
- **Why it holds:**
  1. On 40 Act, select the dashed Close Affiliate line into the BDC from the portfolio companies and blockers. It is all of theirs, drawn as one.
  2. In the inspector, pick Fund III Blocker's.
  3. Step down through the reason in the formula bar.
- **As of a day:** set the date to December 31, 2023. GP III is still the Cayman feeder's general partner; the change took effect on July 9, 2024.
- **History:** it lists every change by who and when. Pick one to see the chart as it stood, and undo it if you need to.

## What a suspicious reader will ask

- **When did a holding start?** On the day its closing document says. Fund III's and the BDC's stakes in Northpine from the consent of November 2, 2023; the Blocker's in Halvard from the resolutions of March 11, 2024, its stock certificate dated the same day; AIV-1 Blocker's in Tessellate from the consent of March 14, 2025; the funds' in Corvane from the consent of February 20, 2026. The investors and the feeder hold from the first closing, June 30, 2023; the BDC's holders from its advisory agreement, January 31, 2022. A holding with no day of its own (a founder's in the Manager, Fund III's in the Blocker) was held from the day what's held was formed, and says so as "all along".
- **Does Corvane's re-cut balance?** Yes. On June 15, 2026 the funds sold 8 points, 7 and 1, pro rata, and Co-Invest bought those 8, so the sponsor's side stays 64%. The rest of Corvane is held by others the chart doesn't track.
- **Why does Ownership Adds Up skip portfolio companies and the BDC?** Rebecca A. Moretti's change of October 23, 2026, 2:45 PM, says why in its own note: their other holders aren't charted, so a shortfall there (Halvard 82%, Tessellate 66%, Northpine 76%, Corvane 64%, the BDC 10%) is no problem. It took the error count from 9 to 4, which is the example of a rule change that clears findings. The outside holders are deliberately not recorded as boxes: they'd crowd every chart for a fact the team doesn't keep.
- **ERISA.** ERISA Plan Assets is worked out, never typed. Fund III's benefit plan investors hold 12.84% (10% of the U.S. Investors' 71.6%, and 20% of the feeder's 28.4%), under the 25% test; Fund III-A's, 100%, but it has a VCOC opinion, dated at its first closing, which takes it out as an operating company. The percentages are fictional, and the reading is simplified: the regulation (29 C.F.R. § 2510.3-101, with ERISA § 3(42)) tests each class of equity by value and leaves out the sponsor's own interests.
- **§57: why is the Manager close?** Two grounds, each a row of its own: it's the BDC's investment adviser (§57(b)(2)), and Chen, a director of the BDC, controls it (§57(b)(1)). Its people are close by the first: Ferraro, Moretti and Lindqvist are its officers or employees, §2(a)(3)(D) affiliates of the BDC's adviser.
- **§57: why is Fiona MacAllister on neither list?** That's right on the chart's facts. She's only an independent director of the Cayman GP, so she is a §2(a)(3)(D) affiliate of it and of nothing else. The Cayman GP is close only as an affiliate, by Chen's control of it: §57(b)(1) reaches a director's (C) affiliates and stops there, and §57(b)(2) and (e)(2) reach the affiliates of the persons they name (the BDC's directors, officers, employees and adviser, and whoever controls it or is under common control with it), none of whom she's affiliated with. The chart records no controller of the BDC: the Manager advises it and Chen chairs its board, but no one holds 25% of its vote, and there's no general partner or managing member. So nothing is under common control with it. That's a reading of §2(a)(9) a lawyer may not share: enter Control of the BDC by the Manager, and the Cayman GP is under common control with the BDC, so a (b)(2) person, and she becomes a close affiliate under (b)(2)'s last clause.
- **Does Fund III hold Tessellate?** No. AIV-1 holds it, through AIV-1 Blocker, 66%, for AIV-1's own investors. The group was once called "AIV-1 Investors (Fund III and III-A Partners)", words the chart couldn't answer for and that read like a Fund III holding; it's AIV-1 Investors now, as Co-Invest's are Co-Invest Investors.
- **Delaware's $400?** It's real. House Bill 400, signed May 21, 2026, raised the annual tax of a Delaware limited partnership or LLC from $300 to $400 from tax year 2026, so the first $400 falls due June 1, 2027. A corporation's franchise tax is its own.
- **Is a Director asked for a title?** No: the position says it. An officer or employee still is. Formation dates for Northpine and Halvard, Northstar's jurisdiction and Raman's start at the BDC are recorded now. The one blank left is the email's.

## How it's kept

The sample was converted from the earlier app's and revised since by scripts. What the app's own building changed after the team's work is folded into the rows it fixed, as if the chart had been kept that way from the start: the charts' palettes, captions, layouts and pages, the renamed lists and labels, Fiscal Year End as a day of the year, the people's addresses, the jurisdictions to choose from, Vehicle Type required and the pension plan's Third Party, the rules that track only the family's own entities, and the registered agent once kept as text, The Corporation Trust Company, as the relation, which Jordan's changes of January 2025 delete as before. The formation documents and governing agreements it lacked are filed with the documents of their time. The revision that gave each tax year its own Delaware tax, a corporation's franchise tax among them, records each payment made before it at the year it settled, from the day it was paid, so the chart as of every day owes what was owed then. A third review, by a suspicious associate, folded in Evidence as one relation with its stock certificates, the merger's rows, the holdings' days, the blanks that were only gaps, Corvane's balance, ERISA as a rule and its VCOC opinion, the adviser's own row of §57(b)(2), and the plainer investor group names. So every change in History is one of the three people's, made in working hours, and the chart as it stood after each works out as it did, with those documents on file. The tests check its counts: [app/tests/core-test.html](../app/tests/core-test.html) and [engine-test.html](../app/tests/engine-test.html).
