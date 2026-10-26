# Formulas

This extends [data-model.md](data-model.md), and [dendra.md](dendra.md)'s "Definitions" says it in brief. Some records can be worked out by formula instead of entered, the way a spreadsheet works some cells out from others.

The examples use the sample, the Calder Ridge fund complex ([app/sample/calder-ridge.js](app/sample/calder-ridge.js)), as of October 26, 2026. Its definitions are its Formula notes. [app/tests/engine-test.html](app/tests/engine-test.html) checks every result this document claims. Ownership is a tag with edges Owner and Owned, with a Percentage field located at it, and a Voting Percentage (see [Votes, not economics](#votes-not-economics)).

For the 40 Act examples, the sample has, among the rest:
- **A BDC.** Calder Ridge Capital BDC, Inc., which the management company advises. It holds 12% of Northpine.
- **People.** Chen and an independent director, Raman, sit on the BDC's board. Okafor is an officer of the BDC and of the management company. A pension plan holds 7% of the BDC.
- **Positions.** A choice relation with edges Holder and Company, whose options are §57(b)(1)'s list: Director, Officer, Employee and Advisory Board Member. From the company's side, its list is **Personnel**.
- **Investment Adviser.** A tag relation with edges Adviser and Client. From the client's side, its list is **Advisers**.
- **Investment Company Status.** A choice on Entities: 3(c)(7) Fund for the fund and the feeder, and Business Development Company for the BDC. Two tags follow from it:
  - **Private Fund**, by `← [Investment Company Status] IN {"3(c)(1) Fund", "3(c)(7) Fund"}`;
  - **Investment Company**, by `← [Investment Company Status] = "Business Development Company"`.

## The idea

A **definition** belongs to an entry or relation, and works out its output wherever it could be located, the way a calculated column in an Excel table works out a value in every row. It's a list of **rows**, each a label and a formula. A row's formula starts with one of:
- `=`, and gives an output: a value, an option, or for a tag TRUE (attested) or FALSE (ruled out);
- `←`, read "implied by", which is short for `= IF(c, TRUE)`: TRUE where the condition c holds, and nothing elsewhere. So it never rules anything out. Typing `<-` turns into `←`.

The **output** at a record is:
- the entered record, if one stands there: it's row zero, so **entered wins**;
- otherwise, what the first row that gives something gives;
- for a tag whose rows are all `←`, any row that holds;
- and where no row gives anything, nothing is recorded.

Legal definitions read this way: "affiliated person of another person means (A) …; (B) …". A row's label is free text, such as "(C)" or "Presumed: more than 25% of voting securities", and several rows can share one.

A formula's references are relative, but relative to the schema instead of a grid. They name the arguments of the record being worked out, the other entries at its location, and paths from either. So one formula serves every Entity, or every pair of an owner and what it owns.

Computed records are records. Styles apply to them, entries can be located at them, and formulas can read them. Each can say why it's there, by its ground (see [Why a record is there](#why-a-record-is-there)).

## Examples

### Does ownership add up?

A tag **Ownership Adds Up**, on Entities, Individuals and Investor Groups:

| Label | Row |
| --- | --- |
| Owners recorded | `= IF(COUNT(Owners) > 0, SUM(Owners.Percentage) = 100%)` |

`Owners` is the entity's list of owners: its relatives in the Owner role of Ownership, seen from the Owned side. `Owners.Percentage` is the Percentage on each of those ownerships.

On the sample:
- it's attested on the fund (71.6% plus 28.4%), the feeder, the blocker, the GP and the management company;
- it's ruled out on Northpine (64% plus 12%), Halvard (82%) and the BDC (7%), whose other owners aren't charted;
- individuals and investor groups have no owners, so the IF gives nothing and nothing is recorded.

### Default tax classification, overridden by an election

A choice **Tax Classification**, at Entity Type:

| Label | Row |
| --- | --- |
| Corporation | `= IF(@ = "Corporation", "C Corporation")` |
| Single owner | `= IF([Ownership Adds Up] AND COUNT(Owners) = 1 AND KIND(Owners) <> "Investor Group", "Disregarded Entity")` |
| Otherwise | `= "Partnership"` |

How the names resolve:
- `@` reads as "this". In an entry's formula it's the record the entry is located at: here the Entity Type record, whose output is the entity type.
- Entity Type has no entries called Ownership Adds Up or Owners, so those names are looked up the path, on the entity.
- `KIND(Owners)` is the kind of the one owner. An investor group stands for many investors, so an entity wholly owned by one isn't disregarded.

It covers Tax Classification at Limited Partnership, Limited Liability Company and Corporation. So it fills in Northpine (Partnership) and Halvard (C Corporation), and leaves the Cayman feeder, an Exempted Limited Partnership, alone. "Disregarded Entity" isn't an option yet; writing it into a row adds it.

**Overrides.** The BDC, a corporation, elected to be taxed as a regulated investment company, so that's entered for it, and the entry wins. The rows would give "C Corporation" there, and the panel shows both. Where an entry agrees with the rows, as the other entities' do, it can be cleared.

### Look-through ownership: one row that reads itself

A percentage relation **Look-Through Ownership**, with edges Investor (an Entity, Individual or Investor Group) and Investment (an Entity):

| Label | Row |
| --- | --- |
| Directly and through each holding | `= Ownership(Investor, Investment).Percentage + SUM(EACH(Investor.Holdings, @.Percentage * [Look-Through Ownership](@, Investment)))` |

It's the direct holding, plus, through each holding, that holding's share of what the holding looks through to.
- `Holdings` is the list of what something owns. Inside EACH, `@` is each holding in turn, and `@.Percentage` the Percentage on that ownership.
- Nothing drops out of a sum and wipes out a product (see [Nothing](#nothing)). So with no path from the Investor to the Investment, the row gives nothing, and the relation is recorded only between connected pairs.
- Unlike a tag relation, a value relation can relate a thing to itself, so a look-through around an ownership loop counts every trip around it.

On the sample:
- Non-U.S. Investors hold 28.4% of the fund through the feeder, and 18.176% of Northpine;
- U.S. Investors hold 58.712% of Halvard (71.6% × 100% × 82%).

The row reads its own records, so it's worked out round by round (see [Loops](#loops)): direct holdings first, then paths of two steps, and so on. If ownership loops back on itself, the rounds converge to the sum over every path, as long as each trip around the loop multiplies to less than 100%. With Northpine owning 20% of the fund, U.S. Investors hold 71.6% / (1 − 64% × 20%) of it.

### Votes, not economics

§2(a)(9)'s presumption counts voting securities, and so do §2(a)(3)(A) and (B). A percentage field **Voting Percentage**, at Ownership, says what share of the owned company's votes a holding carries:

| Label | Row |
| --- | --- |
| Limited partnership interest | `= IF(Owned.[Entity Type] IN {"Limited Partnership", "Exempted Limited Partnership"}, 0%)` |
| Votes with the holding | `= Percentage` |

In an entry's formula a bare name is looked up on its location, so `Owned` is the Ownership's Owned side and `Percentage` its Percentage. A limited partnership interest doesn't vote for the general partner, so by default it carries none; any other holding votes with its Percentage. Where a holding votes otherwise, such as non-voting units or a limited partner who can remove the general partner, its Voting Percentage is entered, and the entry wins. On the sample the six holdings of limited partnership interests, the feeder's 28.4% of the fund among them, carry 0%.

### Control: directly or indirectly, and rebutting the presumption

A tag relation **Control**, with edges Controller (an Entity or Individual) and Controlled (an Entity). The Controlled side is Entities only because §2(a)(9) presumes a natural person isn't controlled.

| Label | Row |
| --- | --- |
| General partner | `← Controller IN Controlled.[General Partners]` |
| Managing member | `← Controller IN FILTER(Controlled.Members, @.Membership = "Managing Member")` |
| Presumed: more than 25% of voting securities | `← SUM(FILTER(Controlled.Owners, @ = Controller OR Control(Controller, @)).[Voting Percentage]) > 25%` |
| Through a controlled company | `← ANY(Controller.[Controlled Companies], Control(@, Controlled))` |

- **General partner.** `[General Partners]` is the GP relation's list, seen from the fund's side. That relation is located at the fund's Entity Type, not at the fund, but an object still has the lists of relations located below it.
- **Managing member.** After a list of relatives, a dot looks first at the relation that links each one, so `@.Membership` is that membership's option.
- **Presumed: more than 25% of voting securities** is §2(a)(9)'s presumption: "owns beneficially, either directly or through one or more controlled companies, more than 25 per centum of the voting securities". FILTER keeps the owners that are the Controller itself or that it controls, and the sum is of their Voting Percentage.
- **Through a controlled company** makes control "direct or indirect": whoever controls a company controls what that company controls.

Control reads itself in two rows. That's allowed, since more control can only make more rows hold (see [Loops](#loops)).

Its Description gives §2(a)(9)'s words, a paragraph for each row beginning with the row's label, so the definition's page sets the statute beside the rows, and says where the rows read it narrowly.

**On the sample**, Control attests 51 pairs. Among them:
- Chen and Okafor control the management company (60% and 40%), the GP (50% each) and the sponsor's holding company, which controls the Cayman GP;
- the GP controls the fund, Fund III-A, the AIV and the co-invest vehicle, and the Cayman GP the feeder, as their general partner;
- the fund controls the blocker (100%), Northpine (64%), Corvane (49%) and, through the blocker, Halvard (82%).

The feeder holds 28.4% of the fund, but as a limited partner, so it doesn't control the fund, nor do the Cayman GP and the holding company through it. Before Voting Percentage, the presumption made all three controllers of the fund and of what it controls, 15 pairs.

Eleven hold only through a controlled company: Chen and Okafor control the fund, Fund III-A, the AIV, the co-invest vehicle and the feeder, and the holding company the feeder, through a general partner they control.

**Rebutting the presumption.** Okafor holds half of GP III's units, but Chen is its managing member. Rule out the Control between Okafor and GP III.
- The entry wins over the rows, and the presumption still shows beneath it, holding: the presumption and the rebuttal are both on screen.
- The ruling-out is a record, so its basis can be located at it, such as an SEC order and its date.
- Whatever held only through it goes: Okafor's control of the ten companies he reached through GP III, the fund, Fund III-A, the AIV, the co-invest vehicle, the two blockers, Northpine, Halvard, Corvane and Tessellate. Chen's stays.

### Affiliated person: rows that cite the statute

A tag relation **Affiliated Person** has edges Affiliate and Person (each an Entity or Individual), and one row per clause of §2(a)(3):

| Label | Row |
| --- | --- |
| (A) | `← SUM(FILTER(Person.Owners, @ = Affiliate OR Control(Affiliate, @)).[Voting Percentage]) >= 5%` |
| (B) | `← [Affiliated Person](Person, Affiliate).[(A)]` |
| (C) | `← Control(Affiliate, Person) OR Control(Person, Affiliate) OR ANY(Person.Controllers, Control(@, Affiliate))` |
| (D) | `← Affiliate IN FILTER(Person.Personnel, @.Position <> "Advisory Board Member") OR Affiliate IN Person.[General Partners]` |
| (E) | `← Person.[Investment Company] AND (Affiliate IN Person.Advisers OR Affiliate IN FILTER(Person.Personnel, @.Position = "Advisory Board Member"))` |
| (F) | `← Person.[Investment Company] AND Person.[Entity Type] <> "Corporation" AND NOT ANY(Person.Personnel, @.Position = "Director") AND Affiliate IN Person.Depositors` |

- **(A)** reads "5 per centum or more of the outstanding voting securities" as the holdings' Voting Percentage, so a 5% limited partner isn't an affiliated person of its fund by (A). It attributes holdings through controlled companies in full, the way §2(a)(9) does. Research found no SEC statement on this, so treat it as a reading.
- **(B)** is (A) with the sides swapped. `[Affiliated Person](Person, Affiliate)` calls the relation by name, with its arguments in order, and `.[(A)]` cites its row (A): TRUE where that record is attested and (A) holds there.
- **(C)** reads as the statute does: controls, is controlled by, or is under common control with. Control is already direct or indirect.
- **(D)** covers recorded officers, directors and employees, and general partners. SEC staff also count limited partners as partners, and as copartners of the general partner (IM Guidance Update 2014-12). Each would be one more `OR`.
- **(E)** applies only when the Person is an investment company.
- **(F)** is the depositor of an unincorporated investment company with no board. The sample has a Depositor relation and no depositors, so the list is empty. Its NOT is allowed: Positions aren't on the loop.

(A), (B) and (C) run both ways, while (D), (E) and (F) run one way: a director is an affiliated person of the fund, but the fund isn't an affiliated person of its director. Because Affiliate and Person are separate edges, that direction comes for free. A person is never its own affiliate: a tag relation skips candidates that use one object twice, since a thing doesn't stand to itself as a tag relation says two things stand.

Its Description is §2(a)(3), a paragraph for each clause beginning with its label, "(A) any person directly or indirectly owning, controlling, or holding with power to vote, …", which the definition's page sets beside the clause's row; a last paragraph says where the rows read the statute narrowly: (A) and (B) read Voting Percentage and don't see power to vote held by proxy or agreement, and (D) doesn't count limited partners as partners or copartners. Close Affiliate, Remote Affiliate and Control are described the same way. Its lists are **Affiliated Persons**, seen from the Person, and **Affiliated Person Of**, seen from the Affiliate.

On the sample, Affiliated Person attests 289 pairs, (A) and (B) holding for 39 each. Reading votes changes no pair: each that held by (A) or (B) through the feeder's 28.4% of the fund (56 each before) also holds by (C), since Chen controls both sides.

### Close and remote affiliates of a BDC

SEC staff use "close affiliates" for the persons in §57(b), and "remote affiliates" for those in §57(e) who aren't also in §57(b) (IM Guidance Update 2014-12, notes 2 and 3).

A tag relation **Close Affiliate** has edges Close Affiliate (an Entity or Individual) and BDC. The BDC side is located at an Entity's Investment Company Status, at the option Business Development Company, so the relation exists only for entities recorded as BDCs. In a formula an argument always means its object, so `BDC` is the entity.

| Label | Row |
| --- | --- |
| (b)(1) | `← [Close Affiliate] IN BDC.Personnel` |
| (b)(1) affiliates | `← ANY(BDC.Personnel, [Affiliated Person]([Close Affiliate], @).[(C)])` |
| (b)(2) | `← [Close Affiliate] IN BDC.Advisers OR [Close Affiliate] IN BDC.[General Partners] OR Control([Close Affiliate], BDC)` |
| (b)(2) | `← ANY(BDC.Controllers, WITHOUT(BDC, Control(@, [Close Affiliate])))` |
| (b)(2) affiliates | `← ANY(BDC.[Close Affiliates], @.[(b)(2)] AND LET(a, [Affiliated Person]([Close Affiliate], @), a.[(C)] OR a.[(D)]))` |

- **(b)(1)** is the BDC's directors, officers, employees and advisory board members, and their §2(a)(3)(C) affiliates.
- **(b)(2)** is its adviser and general partner, and anyone who controls it or is under common control with it. Promoters and principal underwriters would be two more `OR`s. Two rows share the label, so the last row cites them together.
- **(b)(2) affiliates** are the (C) and (D) affiliates of the persons under (b)(2). `@.[(b)(2)]` works because a dot after a list item looks first at the linking relation, here the Close Affiliate record.

**The carve-out, in the second (b)(2) row.** §57(b)(2) excepts "any person who, if it were not directly or indirectly controlled by the business development company, would not be directly or indirectly under the control of a person who controls the business development company". `WITHOUT(BDC, …)` works its second argument out as if the BDC weren't in the chart, so control that runs through the BDC drops out, and what's left is control some other way. If the BDC has no controller, everything it controls is excepted.

**On the sample**, the BDC has 21 close affiliates:
- **(b)(1):** Chen and Raman, its directors, and Okafor, its officer;
- **(b)(1) affiliates:** the 15 entities Chen and Okafor control: the management company, the holding company, both GPs, the funds and the feeder, the blockers and the portfolio companies;
- **(b)(2):** the management company, its adviser;
- **(b)(2) affiliates:** the management company's (C) and (D) affiliates, Ferraro, Moretti and Lindqvist among them.

Northpine is a close affiliate even though the BDC holds 12% of it, through the fund that controls it.

**When the carve-out matters.** The sample's BDC controls nothing, so the test also tries the fund as a BDC:
- the GP, Chen, Okafor and the feeder are close affiliates under (b)(2), as is the management company as adviser;
- the carve-out excepts the blocker, Northpine and Halvard, which the fund controls;
- but "(b)(2) affiliates", read literally, brings them back: the GP is a (b)(2) person, and it controls the blocker through the fund. If the carve-out should limit that clause too, the clause takes the same `WITHOUT(BDC, …)`.

These readings come from the statutory text and are for you to correct. The point is whether the formulas can say what you mean either way.

**Remote Affiliate** (edges Remote Affiliate and BDC) follows §57(e). §57(d) reaches only a person "who is not subject to the prohibitions of subsection (a)", that is, one §57(b) doesn't name, so the exclusion comes first and rules close affiliates out:

| Label | Row |
| --- | --- |
| Close affiliate (§57(b)) | `= IF([Close Affiliate]([Remote Affiliate], BDC), FALSE)` |
| (e)(1)(A) | `← [Affiliated Person]([Remote Affiliate], BDC).[(A)]` |
| (e)(1)(B) | `← ANY(FILTER(BDC.[Affiliated Persons], @.[(A)]), [Remote Affiliate] IN FILTER(@.Personnel, @.Position IN {"Director", "Officer"}) OR [Remote Affiliate] IN @.[General Partners])` |
| (e)(1)(C) | `← ANY(FILTER(BDC.[Affiliated Persons], @.[(A)]), [Affiliated Person]([Remote Affiliate], @).[(C)])` |
| (e)(2) | `← ANY(FILTER(BDC.[Close Affiliates], @.[(b)(1)] OR @.[(b)(2)]), [Affiliated Person]([Remote Affiliate], @))` |

- For a close affiliate, the first row gives FALSE, which is the output: it's ruled out, with "Close affiliate (§57(b))" as its reason. Anyone else gets nothing from it, and the next rows decide.
- (e)(1)(B) is an executive officer, director or general partner of a 5% holder. Positions don't record which officers are executive officers, so it counts every officer.
- (e)(1)(C) covers anyone who controls, is controlled by, or is under common control with a 5% holder.
- (e)(2) is an affiliated person of anyone §57(b)(1) or (b)(2) names: the BDC's directors, officers, employees, advisory board members, adviser, general partner and controllers.

On the sample, the pension plan holds 7% of the BDC, so it's a remote affiliate under (e)(1)(A). The sample records no officers, directors or general partners of the pension plan, so (e)(1)(B) finds no one; (e)(2) finds only the BDC's close affiliates. The BDC's 21 close affiliates are ruled out as remote ones.

The 40 Act view shows the BDC and its affiliates by a tag, **BDC Affiliate**, on Entities and Individuals: `← [Investment Company] OR COUNT([Close Affiliate Of]) + COUNT([Remote Affiliate Of]) > 0`. A ruled-out tag doesn't make a relative, so the count is of attested ones: on the sample, the BDC, its 21 close affiliates and the pension plan.

### Counting beneficial owners under §3(c)(1)

An investor group records how many beneficial owners it stands for, in a number field **Beneficial Owners**, which is required. A number field **3(c)(1) Count**, on Entities:

| Label | Row |
| --- | --- |
| Each owner; an investor group, its beneficial owners; a 10% fund, its holders | `= IF([Investment Company Status] = "3(c)(1) Fund", SUM(EACH(Owners, IF(KIND(@) = "Investor Group", @.[Beneficial Owners], IF(@.Percentage >= 10% AND @.[Private Fund], SUM(EACH(@.Owners, IF(KIND(@) = "Investor Group", @.[Beneficial Owners], 1))), 1)))))` |

- It's worked out only for 3(c)(1) funds; a 3(c)(7) fund has no such limit, so the IF gives nothing there. Every fund in the sample is a 3(c)(7) fund, so nothing is recorded.
- An owner counts as one, and an investor group as its beneficial owners, except where §3(c)(1)(A) applies: an entity holding 10% or more that is, or but for §3(c)(1) or §3(c)(7) would be, an investment company (here, a Private Fund tag). Such an owner counts as its own holders.
- Inside the inner EACH, `@` is each of the holder's own owners.
- The 10% test reads the holding's Percentage rather than its votes: SEC staff have treated a limited partnership interest as the equivalent of a voting security for it.
- The statute doesn't say whether the 10% test applies again at each tier. This looks through one tier, to the holder's own holders, so it doesn't read itself and settles around a loop of holdings. Were the fund a 3(c)(1) fund, its count would be 127: the U.S. investors' 86 and, through the feeder's 28.4%, the feeder's 41.

### Is a signatory's capacity borne out?

Signing Authority is a tag relation with edges Signatory, On Behalf Of and Via (itself, or its general partner); from the entity's side its list is **Signatories**, from the signatory's **Signs For**. At it are its **Capacity**, a required choice of Managing Member, General Partner, Director, Officer or Authorized Signatory; its **Start Date**, from which it holds; its **Limit**; and its basis, the documents recorded as Evidence of it, as for positions. A tag **Capacity Held** checks the capacity where the signatory signs:

| Label | Row |
| --- | --- |
| Managing member | `= IF(Capacity = "Managing Member", Signatory IN FILTER(Via.Members, @.Membership = "Managing Member"))` |
| General partner | `= IF(Capacity = "General Partner", Signatory IN Via.[General Partners])` |
| Director or officer | `= IF(Capacity IN {"Director", "Officer"}, ANY(Via.Personnel, @ = Signatory AND @.Position = Capacity))` |
| Authorized signatory | `= IF(Capacity = "Authorized Signatory", COUNT([Evidenced By]) > 0)` |

In an entry's formula at a relation, `Signatory` and `Via` are the relation's sides. On the sample, Chen signs for the funds as GP III's managing member, on its LLC agreement; Okafor is recorded as signing for them the same way, but he is a member of GP III and not its managing member, so his four authorities through it are ruled out until a delegation is recorded.

### Deadlines

Due dates are worked out from what's entered, each from when its obligation was last met, or failing that from what started it.

**One weekend rule each.** A deadline "on or before" a day that falls on a weekend is met by the business day before, `WORKDAY(d + 1, -1)`; one "within" a period that ends on a weekend moves to the next business day, `WORKDAY(d - 1, 1)`. Each deadline's Description says which. So Fund III's LEI, due a year after November 14, 2025, a Saturday, is due November 13, 2026; the Cayman annual returns are due January 29, 2027, the feeder's FATCA return July 30, 2027, and the co-invest vehicle's Form D amendment June 25, 2027, the day before the anniversary of its filing.

**Each tax year's Delaware tax.** A formula can't tell which tax years have begun, so the tax years are objects of a kind **Tax Year**, each in the chart from its first day, with its Year. A tag relation **Annual Tax** has edges Taxpayer, at Entity › Jurisdiction: Delaware, and Tax Year:

| Label | Row |
| --- | --- |
| Each year on the register, from the year of the last payment | `← Taxpayer.[Entity Type] IN {"Limited Partnership", "Limited Liability Company"} AND Taxpayer.[Vehicle Type] <> "Portfolio Company" AND [Tax Year].Year >= YEAR(MAX(Taxpayer.Jurisdiction.[Annual Tax Paid], Taxpayer.[Formation Date]))` |

The tax is owed for every year the entity is on the register, and a payment settles the years before the one it's made in. At each, **Annual Tax Due** is `= WORKDAY(DATE([Tax Year].Year + 1, 6, 1) + 1, -1)`, and **Annual Tax Amount** has two rows, "From tax year 2026", `= IF([Tax Year].Year >= 2026, $400)`, and "Through tax year 2025", `= $300`. From the entity's side its list is **Delaware Annual Tax**.

The AIV, formed February 11, 2025, has paid nothing, so it owes 2025, due June 1, 2026 and overdue, and 2026, due June 1, 2027. With the six that paid for 2025 in May 2026, seven are due June 1, 2027, $2,800 in all. The reason for the AIV's 2025 is the facts that set it, "… Formation Date February 11, 2025 · Annual Tax Paid —": MAX's reason is the date it chose, and every argument that was nothing.

**A fiscal year.** Fiscal Year End is a date, the end of the entity's first fiscal year, and a rule reads its month and day. The Form ADV annual updating amendment is due within 90 days after the fiscal year after the one the last annual amendment covered:

| Label | Row |
| --- | --- |
| 90 days after the fiscal year | `= WORKDAY(LET(fye, [Fiscal Year End], last, MAX([Last Annual Amendment], [Registered On]), end, DATE(YEAR(last), MONTH(fye), DAY(fye)), IF(end < last, EDATE(end, 12), end)) + 89, 1)` |

An interim amendment isn't a Last Annual Amendment, so it doesn't move the date: March 31, 2027 for the management company. Form PF reads its Last Annual Update the same way, with 120 days, and the feeder's audited accounts and Fund Annual Return its Audited Accounts Filed, with six months. With no fiscal year end, the date isn't a date and WORKDAY gives `#VALUE!`, rather than nothing; a fiscal year ending June 30 gives September 28, 2026.

## Writing formulas

### Names

A formula refers to things by name, matched without regard to case, as labels are elsewhere.
- **Brackets.** A name with spaces or punctuation goes in square brackets: `[Formation Date]`, `[3(c)(1) Count]`, `[(A)]`. A one-word name can go without.
- **Bare names.** In a relation's formula, a name on its own is one of the relation's arguments, by its edge label, and always an object. In an entry's formula, it's one of the location's names, and if the location doesn't have it, it's looked up the path, on up to the object. Followed by parentheses, it's a function or a relation called by name.
- **`@` means "this".** In an entry's formula, it's the location. Inside FILTER, ANY, ALL and EACH, it's the item being looked at.
- **Dots.** A dot looks a name up on what's before it. On a record, it tries in order:
  1. if the record was reached through a list of relatives, the relation linking it: its other arguments by edge label, its output by the relation's name, its entries, and its rows' labels. Where a relation is named like one of its edges, as Close Affiliate is, the edge wins;
  2. the record's own entries by label, its lists of relatives by name, a relation's arguments by edge label, and on a tag a definition covers, its rows' labels. An object also has the lists of relations located below it;
  3. the same, on up the record's path to its object.
- **A row's label.** On a tag a definition covers, `.[label]` is TRUE where the tag is attested and a row with that label holds there, and FALSE otherwise.
- **Lists.** A dot after a list looks the name up on each item and gives a list: `Owners.Percentage`.
- **Missing names.** A name the schema has somewhere, but not at this record, gives nothing, or an empty list. A name the schema doesn't have anywhere is `#NAME?`, and so is a name that matches two things at one step.

### Values

**What a record stands for.** An object stands for itself, so `@ = Controller` asks whether they're the same object. Any other record stands for its output: a field for its value, a choice for its option, a tag for TRUE if attested and FALSE if ruled out. It still knows where it is, so a dot can go on from it: `Fund.Jurisdiction.[File Number]`.

**Literals.** Numbers are written as in Excel: `25%` is 0.25. A thousands comma is allowed after `$`, as in `$750,000,000`; otherwise write `1000`, since `IF(x, 1,000)` would be ambiguous. Text goes in double quotes, TRUE and FALSE are written as they are, and a list can be written in braces: `{"Director", "Officer"}`.

#### Nothing

BLANK is **nothing**: what a missing entry gives, and what a definition with nothing to say records.
- It drops out of a sum, so `BLANK() + 2` is 2, and it wipes out a product, so `BLANK() * 2` is nothing.
- SUM, MIN, MAX and AVERAGE of nothing are nothing, and COUNT is 0.
- IF with no third argument gives nothing where its condition fails.
- A date of nothing is nothing.
- In a condition, nothing is FALSE. In a comparison, it takes the least value of the other side's kind, as in Excel: 0, empty text, FALSE, or a date before every date.

So a missing percentage leaves a look-through through it unknown, rather than smaller. To tell a tag that isn't recorded from a ruled-out one, use `ISBLANK`.

**Lists and single values.** A list with one item can be used where one value is expected. An empty list is nothing, and a longer list is `#VALUE!`. Lists of lists flatten. A dot over a list keeps its nothing items, so `Owners.Percentage` lines up with `Owners`.

### Calling a relation

`Ownership(a, b)`, or `Ownership(Owner: a, Owned: b)`, is the Ownership record between a and b.
- Without labels, the arguments go in the relation's own order.
- An object passed for a parameter that sits below the object fills it through the object's record there.
- As a value, the call is the record's output, or nothing if there's no record, and a dot can go on from it: `Ownership(Feeder, Fund).Percentage`, `Control(Okafor, [GP III]).[Managing member]`.

### Functions

| Function | Gives |
| --- | --- |
| `IF`, `AND`, `OR`, `NOT` | As in Excel, except that IF with no third argument gives nothing where its condition fails. AND and OR stop once the answer is known. They can also go between or before their operands: `a AND NOT b`. Comparisons bind tighter than NOT, NOT tighter than AND, and AND tighter than OR. |
| `=`, `<>`, `<`, `>`, `<=`, `>=`, `+`, `-`, `*`, `/`, `&` | As in Excel, with nothing as above. Comparing values of different kinds, like text with a number, is `#VALUE!`. |
| `x IN list` | TRUE if x is one of the list's items. |
| `BLANK()`, `ISBLANK(x)` | Nothing, and whether x is nothing. |
| `COUNT`, `SUM`, `MIN`, `MAX`, `AVERAGE`, `UNIQUE`, `TEXTJOIN` | As in Excel, over lists, except that COUNT counts every item that's something. MIN and MAX also take dates, giving the earliest or latest. |
| `FILTER(list, condition)` | The items for which the condition is TRUE, with `@` as each item. |
| `ANY(list, condition)`, `ALL(list, condition)` | Whether the condition holds for some item, or for every item. |
| `EACH(list, expression)` | The list of the expression's values, with `@` as each item. |
| `LET(name, value, …, expression)` | As in Excel: names a value for use in the expression. |
| `KIND(x)` | x's kind, as text. |
| `OBJECT(name)` | The object whose Name is the text, without regard to case: nothing if there's none, `#VALUE!` if there are several. |
| `WITHOUT(x, expression)` | The expression, worked out as if x and everything that depends on it weren't in the chart, with every computed record worked out again. For counterfactuals like §57(b)(2)'s carve-out. It can't read the definition it's in, since that's always a loop. |
| `TODAY`, `DATE`, `YEAR`, `MONTH`, `DAY`, `YEARFRAC`, `EDATE`, `EOMONTH`, and text functions | As in Excel. |
| `WORKDAY(date, days)` | As in Excel, without holidays. `WORKDAY(d - 1, 1)` is the first working day on or after d, where a deadline falling on a weekend moves to. |

### Errors

Errors show where the output would be, as in Excel, and pass on to whatever reads them: `#NAME?` for a name the schema doesn't have, `#VALUE!` for the wrong kind of value, `#REF!` for something deleted, `#OPTION?` for a choice row giving text that isn't an option, `#DIV/0!`, and `#CIRCULAR!`. For a tag whose rows are all `←`, a row that runs into an error doesn't hold, and the tag shows the error only if no row holds.

## Loops

Definitions are worked out in the order in which they read each other, as cells are in a spreadsheet. A definition reads another when its rows use a name the other gives records under (its name, or for a relation its lists and edge labels), or when it's located at the other's records. Definitions that read each other, or a definition that reads itself, form a **loop**, and are worked out together, round by round:
- they start from nothing;
- each round works every row out again whose inputs changed in the round before, reading the state as that round left it;
- the outputs change together after the round, and where a round changes nothing, they're done.

A loop is **monotone** if nothing on it can go down when what it reads goes up: a tag goes up when it's attested, and a number when it grows. A monotone loop settles at its **least solution**: the fewest attestations, and the smallest numbers, that its rows support. That's how "directly or indirectly" reads, and Control, Affiliated Person and Look-Through Ownership are such loops.

Whether a loop is monotone is read off its rows. Each place a row reads the loop must be one of these:
- inside AND, OR, ANY, FILTER, EACH, COUNT, SUM, MIN, MAX or UNIQUE; in IN's list; on the left of `>` or `>=`; in `+` or `*`; after a dot; in a relation call; in IF's branches, or ALL's condition; or in LET;
- and not inside NOT, ISBLANK, `-`, `/`, `&`, `=`, `<>`, `<`, `<=`, the right of `>` or `>=`, the left of IN, IF's condition, ALL's list, AVERAGE, TEXTJOIN, KIND, OBJECT, or a date or text function.

And since the output is the first row that gives something, a row that reads the loop must not be able to take over from a row after it: past it, every row is `←`. For a tag, a `=` row that reads the loop could give FALSE, which can go down.

Any other loop is a circular reference, and every record it would give shows `#CIRCULAR!`. So does a monotone loop whose numbers never settle, such as the 3(c)(1) count around a cycle (after 1,000 rounds), and a number that goes down after all, as a sum of a negative amount can. The engine says where each row reads its loop, so the formula bar can underline it.

## Why a record is there

A computed record's **stage** is the round in which it first appeared.

Its **ground** is the label of the row that gave it, with the records that row read, defined by cases on the formula, where it gives something:
- for a record it reads, that record;
- for AND, a comparison or arithmetic, the grounds of its parts, less what dropped out of a sum;
- for IF, the grounds of its condition and of the branch it took;
- for OR and ANY, the ground of one part that holds, choosing the one of least stage;
- for FILTER, SUM, COUNT and EACH, each item it counted, with the ground of that item's condition or value;
- for MAX and MIN, the item it chose, and every argument that was nothing;
- for WITHOUT, the ground of its expression in the chart without x: for §57(b)(2), the control that avoids the BDC.

For a tag whose rows are all `←`, the ground is the holding row of least stage, and the other rows that hold are shown beside it. An attestation on a loop is grounded in what it read when it first appeared, so every computed record in its ground comes from an earlier group or an earlier round. Unfolding grounds, one level at a time, always ends at entered records.

For example:
- Okafor controls GP III by "Presumed: more than 25% of voting securities": his ownership of it, with its Voting Percentage of 50%;
- Chen controls the feeder "Through a controlled company": her control of the holding company, and beneath it the holding company's control of the feeder, itself through the Cayman GP, which is "General partner" on the entered relation;
- Non-U.S. Investors' look-through to Northpine is its holding of the feeder at 100%, with the feeder's look-through to Northpine beneath, and so on down the path;
- a ruled-out record keeps its rows' grounds beneath it: the rebutted presumption shows "Presumed: more than 25% of voting securities" and Okafor's 50%;
- an entered value a formula also covers shows what the rows would give, and why.

## In terms of the data model

This restates the above in the terms of data-model.md.

**Definitions.** A definition in a schema S **covers** a set of parameterizations of S that all have the same root edge labels, and whose specifications in S are either all fields of one datatype, all choices, or all tags. It's a nonempty list of rows, each a label and a formula. No parameterization is covered by two definitions.

**Candidates.** If p is a parameterization and Σ is a set of records, a **candidate** for p in Σ is an argumentation obtained from p by replacing each of its locations with a record in Σ whose underlying specification is that location. A definition of tags skips candidates in which two of p's parameters are filled by records belonging to the same object.

**What a row gives.** At a candidate a for a parameterization p that a definition covers, reading a set of records, a row **gives** an output of p, or nothing. A choice's output must be one of p's outputs in S, and writing a new option into a row adds a specification with that output to S.

**The computed state.** A chart has a set E of entered records and a set of definitions. Group by group, in the order they read each other, its **computed state** Σ is the least set of records such that a record is in Σ exactly when either:
- it is in E; or
- its argumentation a is a candidate in Σ for a parameterization covered by a definition, no record in E has argumentation a, and its output is the definition's output at a, reading Σ: the first row's that gives something, or for a tag whose rows are all `←`, TRUE if any row holds.

**Σ is a state.** Every location of a computed record is in Σ, since candidates are built from records of Σ. No two records have the same argumentation, since each argumentation takes its output from E if E has a record there, and otherwise from the one definition covering it. E may contain records located at computed records; such a record is part of Σ only while its location is, and otherwise it's kept aside, as deleted records are.

**WITHOUT.** `WITHOUT(x, e)` reads the computed state of the chart with the same definitions, whose entered records are E without x and its dependents. For a monotone e, that's the same as saying e has a ground with nothing of x in it.

## Names for relations and lists

- **Relation names.** A Name note at a relation's pattern names it: Ownership, Control. It covers every parameterization fitting the pattern, whatever kinds the sides are. Formulas use the name to call the relation, and as the name of a linked record's output (`@.Membership`), and Order notes at its edges give its arguments' order.
- **List names.** A Name note at one of the pattern's edges names the list of relatives in that role: Ownership's Owners are seen from Owned, its Holdings from Owner. Without a name, a list goes by the edge label of the role it lists, and a named list still answers to that label.

## When what a formula refers to changes

- **Renames.** Renaming an entry or relabeling an edge renames it in every formula that mentions it, as Excel does when a table column is renamed.
- **Deletion.** Deleting something a formula refers to turns the reference into `#REF!` wherever it's needed, and restoring it brings the reference back. Deleting a computed entry or relation deletes its definition along with it, together with any entered records located at its computed records.
- **Moving up a level.** References to the moved entry keep working unchanged, because names are looked up the path. `Controlled.[Entity Type].[Manager-Managed]` still finds Manager-Managed after it moves from Entity Type up to the entity.
- **Editing.** Editing a row, or adding, removing or reordering rows, works out again everything that depends on the definition, as one undoable step. Before it's made, the chart shows what would appear and what would go.
- **From entered to computed.** Giving a definition to an entry or relation that already has entered records keeps them as entered. Where the rows would give something else, they're overrides.

## The engine

[app/core/formulas.js](app/core/formulas.js) works a chart out from its entered records as of a day, its Formula notes and its relations' names, as the core's Notes reader gives them; the app keeps the result as `App.computed`, and its records as `App.state`. The engine's header lists what it gives the page.
- **In groups.** Definitions that read each other are worked out together, whatever order they're listed in. A group that doesn't loop takes one round.
- **Where a row can give something.** A relation between two kinds of object has a candidate for every pair, and most pairs come to nothing. So for one argument, given the others, the engine reads off a row's form where it can give something, and tries just the candidates there, the way a database joins tables. `Controller IN Controlled.[General Partners]` holds just for the general partners, and needs no working out; the look-through's row gives something only where the investor owns the investment, or a holding looks through to it. Where the form doesn't tell, every candidate is tried.
- **What changed.** Each row worked out remembers what it read, so a round works out again only what read something the round before changed.
- **On demand.** A ground is worked out when it's asked for, by working the row out again at its record, as of its stage. So is the formula bar's view of a row: each name's records there, and each part's value.
- **How fast.** [perf-test.html](app/tests/perf-test.html) works out the sample in about 15 ms, and a change to it, compared with the state before, in about 10 ms, so the redline can follow every keystroke. With 100 more entities in layers it takes about 0.3 seconds, and with 200 (about 68,000 computed records) about 1.1 seconds.

## What it can't express

- **Loops that aren't monotone,** such as "controls, unless someone else controls more", show `#CIRCULAR!`. So does a definition that reads itself through `-` or NOT, even where its records don't actually loop, as a value read from a parent's would.
- **Look-through around an ownership loop** has infinitely many paths, so its ground unfolds around the loop as far as it's followed.
- **Why not** is best-effort: the formula bar shows each part's value at a pair that has no record, not a proof.
- **WITHOUT** reads as "a reason that avoids x" only for monotone conditions, and it can't read its own definition.

## Open questions

1. **Syntax.** Do these read well: `@`, the bracketed names, dots that look at the linking relation first, `.[label]`, and EACH, FILTER and ANY?
2. **Naming a particular object.** Should a formula be able to name one object, as in "the close affiliates of Fund III"? `OBJECT("Fund III")` finds an object by its Name, but a name can change, so a reference that follows the object would be sturdier.
3. **Relation names and edge labels.** Should a relation's name be allowed to equal one of its edge labels? Close Affiliate's is, which is why a dot gives the edge there.
4. **A definition that reads itself one way.** Excel works out a column whose cells read the row above, through `-` or anything else, as long as no cell reads itself. Here such a definition is `#CIRCULAR!` unless it's monotone. Should a loop that isn't monotone be worked out record by record, as Excel does, where its records don't loop?
5. **A thing and itself.** A tag relation skips pairs of one object with itself, and a value relation doesn't, so look-through can count an ownership loop. That replaced a switch on each definition. Is it the right line?
6. **Rebuttals.** Should an entry that rules out a tag its rows attest ask for its basis?
7. **Cardinality hints.** A hint, such as "a fund has at most one general partner", would let the editor warn about a list that could have several items where one value is expected. Should it be enforced, or only warned about?
