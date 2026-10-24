# Formulas

*A first pass, for discussion.*

This extends [data-model.md](data-model.md). Some records can be worked out by formula instead of entered, the way a spreadsheet works some cells out from others.

The examples use the sample chart in [UI/mockups](UI/mockups/), where every one of them is built in and can be tried (see [The prototype](#the-prototype)). Ownership there is a tag with edges Owner and Owned, with a Percentage field located at it, as decided on 2026-10-24. The examples also use the names this document pilots for relations and their lists of relatives (see [Names for relations and lists](#names-for-relations-and-lists)).

For the 40 Act examples, the sample has the following:
- **A BDC.** Calder Ridge Capital BDC, Inc., which the management company advises. It holds 12% of Northpine.
- **People.**
  - Chen and an independent director, Raman, sit on the BDC's board.
  - Okafor is an officer of the BDC and of the management company.
  - A pension plan holds 7% of the BDC.
- **Positions.** A choice relation with edges Holder and Company. Its options are Director, Officer, Employee and Advisory Board Member, which are §57(b)(1)'s list. From the company's side, its list is **Personnel**.
- **Investment Adviser.** A tag relation with edges Adviser and Client. From the client's side, its list is **Advisers**.
- **Investment Company Status.** A choice on Entities: 3(c)(7) Fund for the fund and the feeder, and Business Development Company for the BDC. Two tags are implied by it:
  - **Private Fund**, by `← [Investment Company Status] IN {"3(c)(1) Fund", "3(c)(7) Fund"}`;
  - **Investment Company**, by `← [Investment Company Status] = "Business Development Company"`.

## The idea

A formula belongs to an entry or relation. It works out that entry's output wherever the entry could be located, the way a calculated column in an Excel table works out a value in every row.

Its references are relative, but relative to the schema instead of a grid. They name:
- the arguments of the record being worked out;
- the other entries at its location;
- paths from either of those.

So one formula serves every Entity, or every pair of an owner and what it owns.

A formula is written in one of two ways:

| Starts with | Read as | Used on | What it records |
| --- | --- | --- | --- |
| `=` | "equals" | fields, choices and tags | The output it gives: a value, an option, or for a tag TRUE (attested) or FALSE (ruled out). Where it gives BLANK, nothing is recorded. |
| `←` | "implied by" | tags | An attestation wherever its condition holds. Where the condition doesn't hold, nothing is recorded, so an implication never rules anything out. |

Typing `<-` at the start of a formula turns it into `←`.

A tag can have several implications, each with a label of its own, and it is attested wherever any of them holds. Legal definitions are written this way: "affiliated person of another person means (A) …; (B) …". A computed tag remembers which implications put it there, so it can say why it exists.

Computed records are records. They show in the panel and on the chart, styles apply to them, entries can be located at them, and other formulas can read them. Two things set them apart:
- The panel shows them as computed, and can say why each one is there.
- An entered record always wins over a computed one with the same argumentation (see [Entered records win](#entered-records-win)). That is how a presumption gets rebutted.

## Examples

### Does ownership add up? A tag, with `=`

A tag **Ownership Adds Up**, on Entities, Individuals and Investor Groups:

`= IF(COUNT(Owners) = 0, BLANK(), SUM(Owners.Percentage) = 100%)`

`Owners` is the entity's list of owners. In other words, it lists the entity's relatives in the Owner role of Ownership, seen from the Owned side. `Owners.Percentage` is the Percentage on each of those ownerships.

On the sample:
- The tag is attested on the fund (71.6% plus 28.4%), the feeder, the blocker, the GP and the management company.
- It's ruled out on Northpine (64% plus 12%), Halvard (82%) and the BDC (7%), whose other owners aren't charted.
- Individuals and investor groups have no owners, so the formula gives BLANK for them and nothing is recorded.

### Default tax classification: a choice, overridden by an election

A choice **Tax Classification**, at Entity Type:

`= IFS(@ = "Corporation", "C Corporation", [Ownership Adds Up] AND COUNT(Owners) = 1, "Disregarded Entity", TRUE, "Partnership")`

How the names resolve:
- `@` reads as "this". In the formula for an entry, it means the record the entry is located at. Here that is the Entity Type record, whose output is the entity type.
- Entity Type has no entries called Ownership Adds Up or Owners, so those names are looked up the path, on the entity.
- Names with spaces in them go in square brackets.

**What the formula covers.** It covers Tax Classification at every Entity Type that has one in the schema: Limited Partnership, Limited Liability Company and Corporation. So:
- It fills in Northpine and Halvard, which have an Entity Type but no Tax Classification yet.
- It leaves the Cayman feeder (an Exempted Limited Partnership) alone, unless the formula is extended to cover that too.

**Overrides.** The formula gives the default classification. The sample's BDC, a corporation, elected to be taxed as a regulated investment company, so "Regulated Investment Company" is entered for it by hand. The entered option wins, and the panel marks it as differing from the formula's "C Corporation", like the mark Excel puts on a calculated-column cell that has been typed over. Where an entered option agrees with the formula, as the other entities' do, the panel can offer to clear it.

**New options.** "Disregarded Entity" isn't an option yet. Writing it into the formula adds it.

### Look-through ownership: a chain of any length

A number field relation **Look-Through Ownership**, with edges Investor (an Entity, Individual or Investor Group) and Investment (an Entity):

`= LOOKTHROUGH(Investor, Investment, Holdings, Percentage)`

How it works:
- `Holdings` is the list of what something owns.
- LOOKTHROUGH starts at the Investor and follows Holdings any number of times, multiplying by the Percentage at each step.
- It adds up every path that ends at the Investment.
- Where no path leads there, it gives BLANK. So the relation is recorded only between connected pairs.

On the sample:
- Non-U.S. Investors hold 28.4% of the fund through the feeder, and 18.18% of Northpine.
- U.S. Investors hold 58.71% of Halvard (71.6% × 100% × 82%).

If ownership loops back on itself, there are infinitely many paths. Their sum still has a limit as long as each trip around the loop multiplies to less than 100%, and LOOKTHROUGH gives that limit.

### Control: implications, a presumption, and rebutting it

A tag relation **Control**, with edges Controller (an Entity or Individual) and Controlled (an Entity). The Controlled side is Entities only because §2(a)(9) presumes a natural person isn't controlled. It has three implications:

| Label | Implication |
| --- | --- |
| More than 25% | `← SUM(FILTER(Controlled.Owners, @ = Controller OR @ IN REACH(Controller, [Controlled Companies])).Percentage) > 25%` |
| General partner | `← Controller IN Controlled.[General Partners]` |
| Managing member | `← Controller IN FILTER(Controlled.Members, @.Membership = "Managing Member")` |

**More than 25%** is §2(a)(9)'s presumption: "owns beneficially, either directly or through one or more controlled companies, more than 25 per centum of the voting securities".
- FILTER keeps the owners that are the Controller itself, or that the Controller directly or indirectly controls. Inside FILTER, `@` is each owner in turn.
- `REACH(Controller, [Controlled Companies])` is everything the Controller controls, directly or indirectly. It follows Control's list of controlled companies one or more times.
- The formula reads its own relation, at other records, and that's allowed (see [Loops](#loops)).
- Percentage stands in for the share of votes, which is what §2(a)(42) measures. A chart that tracks economic and voting interests separately would use a Voting Percentage at Ownership.

**General partner.**
- `[General Partners]` is the GP relation's list, seen from the fund's side.
- That relation is located at the fund's Entity Type, not at the fund itself. An object still has the lists of relations located below it, the same way a relation call fills a parameter through the object's record there.
- For an entity whose type has no general partners, the list is empty.

**Managing member.**
- After a list of relatives, a dot looks first at the relation that links each one.
- So `@.Membership` is that membership's option.

**Results on the sample.** There are 25 attestations in all. Among them:
- Chen and Okafor control the management company (60% and 40%) and the GP (50% each).
- The GP controls the fund and the feeder.
- The fund controls the blocker (100%), Northpine (64%) and, through the blocker, Halvard (82%).
- The feeder controls the fund, since it holds 28.4%: the presumption at work. Because the feeder controls the fund, it also controls everything the fund does.
- Holdings attributed through controlled companies carry control down the chain, so the GP, Chen and Okafor control the portfolio companies too.

**Rebutting the presumption.** Click the attested Control between the feeder and the fund, and it is ruled out.
- The entered ruling-out wins over the implication.
- The panel marks it as overriding "More than 25%". The ruling-out is a record, so the basis can be located at it (an SEC order and its date, say).
- Whatever was implied only through it goes away: the feeder's control of the blocker, Northpine and Halvard.

This is the attestation reading at work: an implication attests, and a ruling-out by someone who knows better takes it back.

### Affiliated person: implications that cite the statute

These definitions use the sample's Positions, Investment Advisers and Investment Company tag (see the start of this document).

A tag relation **Affiliated Person** has edges Affiliate and Person (each an Entity or Individual), and one implication per clause of §2(a)(3):

| Label | Implication |
| --- | --- |
| (A) | `← SUM(FILTER(Person.Owners, @ = Affiliate OR @ IN REACH(Affiliate, [Controlled Companies])).Percentage) >= 5%` |
| (B) | `← IMPLIEDBY([Affiliated Person](Person, Affiliate), "(A)")` |
| (C) | `← Affiliate IN REACH(Person, Controllers) OR Affiliate IN REACH(Person, [Controlled Companies]) OR ANY(REACH(Person, Controllers), Affiliate IN REACH(@, [Controlled Companies]))` |
| (D) | `← Affiliate IN FILTER(Person.Personnel, @.Position <> "Advisory Board Member") OR Affiliate IN Person.[General Partners]` |
| (E) | `← Person.[Investment Company] AND (Affiliate IN Person.Advisers OR Affiliate IN FILTER(Person.Personnel, @.Position = "Advisory Board Member"))` |

Notes on the clauses:
- **(A)** attributes holdings through controlled companies in full, the way §2(a)(9) does. Research found no SEC statement on this, so treat it as a reading.
- **(B)** is (A) with the two sides swapped. `[Affiliated Person](Person, Affiliate)` calls the relation by name, with its arguments in order. `IMPLIEDBY` asks whether that record is attested by the implication labeled (A).
- **(C)** is control in either direction, or a third person controlling both, "directly or indirectly".
- **(D)** covers recorded officers, directors and employees, and general partners. SEC staff also count limited partners as partners, and as copartners of the general partner (IM Guidance Update 2014-12). Each of those would be one more `OR`.
- **(E)** applies only when the Person is an investment company.
- **(F)**, the depositor of an unincorporated investment company, would follow the same pattern.

(A), (B) and (C) run both ways, while (D) and (E) run one way: a director is an affiliated person of the fund, but the fund isn't an affiliated person of its director. Because Affiliate and Person are separate edges, that direction comes for free.

A person is never its own affiliate. A relation's formula skips candidates that use the same object twice, unless the relation is marked as able to relate a thing to itself.

### Close and remote affiliates of a BDC

SEC staff use "close affiliates" for the persons in §57(b), and "remote affiliates" for those in §57(e) who aren't also in §57(b) (IM Guidance Update 2014-12, notes 2 and 3).

A tag relation **Close Affiliate** has edges Close Affiliate (an Entity or Individual) and BDC.
- The BDC side is located at an Entity's Investment Company Status, at the option Business Development Company.
- So the relation exists only for entities recorded as BDCs, the same way the GP relation reaches a fund through its Entity Type.
- In a formula, an argument always means its object, so `BDC` is the entity.

| Label | Implication |
| --- | --- |
| (b)(1) | `← [Close Affiliate] IN BDC.Personnel` |
| (b)(1) affiliates | `← ANY(BDC.Personnel, IMPLIEDBY([Affiliated Person]([Close Affiliate], @), "(C)"))` |
| (b)(2) | `← [Close Affiliate] IN BDC.Advisers OR [Close Affiliate] IN BDC.[General Partners]` |
| (b)(2) | `← [Close Affiliate] IN REACH(BDC, Controllers)` |
| (b)(2) | `← ANY(REACH(BDC, Controllers), WITHOUT(BDC, [Close Affiliate] IN REACH(@, [Controlled Companies])))` |
| (b)(2) affiliates | `← ANY(BDC.[Close Affiliates], IMPLIEDBY([Close Affiliate](@, BDC), "(b)(2)") AND IMPLIEDBY([Affiliated Person]([Close Affiliate], @), "(C)", "(D)"))` |

In words:
- **(b)(1).** Directors, officers, employees and advisory board members of the BDC, and anyone who is a §2(a)(3)(C) affiliate of one of them.
- **(b)(2), first three rows.** The BDC's adviser and general partner, anyone who controls the BDC, and anyone controlled by it or under common control with it.
  - Promoters and principal underwriters would be two more `OR`s.
  - Three rows share the label (b)(2), so the last row can cite them as a group.
- **(b)(2) affiliates.** §2(a)(3)(C) or (D) affiliates of the persons in the first three (b)(2) rows.

**The carve-out, in the third (b)(2) row.** §57(b)(2) excepts "any person who, if it were not directly or indirectly controlled by the business development company, would not be directly or indirectly under the control of a person who controls the business development company".
- `WITHOUT(BDC, …)` works its second argument out as if the BDC weren't in the chart, so control that runs through the BDC drops out.
- What's left are the controlled companies that a controller of the BDC reaches some other way.
- So if the BDC has no controller, everything it controls is excepted.

**On the sample.** The BDC has ten close affiliates:
- **(b)(1):** Chen and Raman, its directors, and Okafor, its officer.
- **(b)(1) affiliates:** everything Chen and Okafor control: the management company, the GP, the fund, the feeder, the blocker, Northpine and Halvard.
- **(b)(2):** the management company, its adviser.
- **(b)(2) affiliates:** the management company's §2(a)(3)(C) and (D) affiliates. That is Chen and Okafor, who control it, and the companies under common control with it.

Northpine is a close affiliate even though the BDC holds 12% of it, through the fund that controls it.

The pension plan holds 7% of the BDC, so it is a remote affiliate under (e)(1)(A).

**When the carve-out matters.** The sample's BDC controls nothing, so the carve-out doesn't come up there. The formula lab's self-test also tries the fund as a BDC:
- The GP, Chen, Okafor and the feeder are close affiliates under (b)(2), as is the management company as adviser.
- The carve-out excepts the blocker, Northpine and Halvard, which the fund controls.
- But "(b)(2) affiliates", read literally, brings them back. The GP is a (b)(2) person, and it controls the blocker through the fund, so the blocker is the GP's §2(a)(3)(C) affiliate.
- If the carve-out should limit that clause too, the clause takes the same `WITHOUT(BDC, …)`.

These readings come from the statutory text and are for you to correct. The point here is whether the formulas can say what you mean either way.

**Remote Affiliate** (edges Remote Affiliate and BDC) follows the same pattern for the clauses of §57(e). §57(d) reaches only persons who aren't close affiliates, so each of its implications ends with `AND NOT [Close Affiliate]([Remote Affiliate], BDC)`. The sample has two:

| Label | Implication |
| --- | --- |
| (e)(1)(A) | `← IMPLIEDBY([Affiliated Person]([Remote Affiliate], BDC), "(A)") AND NOT [Close Affiliate]([Remote Affiliate], BDC)` |
| (e)(1)(C) | `← ANY(FILTER(BDC.Affiliates, IMPLIEDBY([Affiliated Person](@, BDC), "(A)")), IMPLIEDBY([Affiliated Person]([Remote Affiliate], @), "(C)")) AND NOT [Close Affiliate]([Remote Affiliate], BDC)` |

(e)(1)(C) covers anyone who controls, is controlled by, or is under common control with a 5% holder.

### Counting beneficial owners under §3(c)(1): a field that reads itself elsewhere

A number field **3(c)(1) Count**, on Entities:

`= IF([Private Fund], SUM(EACH(Owners, IF(KIND(@) = "Entity" AND @.Percentage >= 10% AND @.[Private Fund], @.[3(c)(1) Count], 1))), BLANK())`

- It's worked out only for private funds. Elsewhere it gives BLANK, so nothing is recorded.
- EACH works the expression out for each owner and gives the list of results.
- An owner counts as one, except where §3(c)(1)(A) applies. That is an entity holding 10% or more that is, or but for §3(c)(1) or §3(c)(7) would be, an investment company (here, a Private Fund tag). Such an owner counts as its own holders.
- The formula reads 3(c)(1) Count at other entities, its owners. That's fine as long as ownership doesn't loop back. If it does, the entities on the loop show a circular-reference error, as Excel would.
- The statute doesn't say whether the 10% test applies again at each tier. This formula applies it again, and changing that means changing one condition.

## Writing formulas

### Names

A formula refers to things by name, matched without regard to case, as labels are elsewhere.

**Brackets.** A name with spaces or punctuation goes in square brackets: `[Formation Date]`, `[U.S. Person]`, `[3(c)(1) Count]`. A one-word name can go without.

**Bare names.** A name on its own means the same thing throughout a formula:
- In a relation's formula, it means one of the relation's arguments, by its edge label: `Controller`, `Controlled`. An argument is always an object, even when its parameter sits below the object, as the GP relation's Fund Owned sits at Entity Type.
- In an entry's formula, it means one of the location's own names, as in Excel, where a column name in a calculated column means that column in the same row. If the location doesn't have the name, the name is looked up the path: on the location's location, and so on up to the object.
- When followed by parentheses, it means a relation, called by name (see [Calling a relation](#calling-a-relation)), or a function.

**`@` means "this".** In an entry's formula, it's the location. Inside FILTER, ANY, ALL and EACH, it's the item being looked at.

**Dots.** A dot looks a name up on what's before it: `Controlled.[Entity Type]`. On a record, the lookup tries these in order:
1. If the record was reached through a list of relatives, the relation linking it. That means the relation's other arguments by edge label, its output by the relation's name, and the entries located at it. So `@.Percentage` on an owner is the Percentage on that ownership. If a relation is named like one of its edges, as Close Affiliate is, the edge wins; a relation call still gives its output.
2. The record's own entries, by label, and its lists of relatives, by name.
   - A relation record also has its arguments, by edge label.
   - An object also has the lists of relations located below it, so a fund's General Partners can be reached as `Fund.[General Partners]`, though the relation sits at its Entity Type.
3. The same, on up the record's path to its object.

**Lists.** A dot after a list looks the name up on each item and gives a list: `Owners.Percentage`.

**Missing names.**
- A name that the schema has somewhere, but that isn't at this record, gives BLANK, or an empty list.
- A name the schema doesn't have anywhere is an error (`#NAME?`).
- A name that matches two things at the same step is an error too, and the formula has to say which.

### Values

**What a record stands for.** An object stands for itself, so `@ = Controller` asks whether they're the same object. Any other record stands for its output:
- a field, for its value;
- a choice, for its option;
- a tag, for TRUE if attested and FALSE if ruled out.

It still knows where it is, so a dot can go on from it: `Fund.Jurisdiction = "Delaware"`, `Fund.Jurisdiction.[File Number]`.

**Literals.** Numbers are written as in Excel: `25%` is 0.25. A thousands comma is allowed after `$`, as in `$750,000,000`; otherwise write `1000`, since `IF(x, 1,000)` would be ambiguous. Values the chart stores as typed (like "71.6%") read as numbers. Text goes in double quotes, TRUE and FALSE are written as they are, and a list can be written in braces, like Excel's array constants: `{"Director", "Officer"}`.

**BLANK** is what a missing entry gives. As in Excel:
- it counts as 0 in arithmetic, as empty text, and as FALSE in a condition;
- SUM and the like skip it.

So in a condition, a tag that isn't recorded reads as FALSE, just as a ruled-out one does. To tell the two apart, use `ISBLANK` and `ISRULEDOUT`.

**Lists and single values.**
- A list with one item can be used where one value is expected.
- An empty list counts as BLANK.
- A longer list is an error (`#VALUE!`).
- Lists of lists flatten.
- A dot over a list keeps BLANK items, so that `Owners.Percentage` lines up with `Owners`.

### Calling a relation

`Ownership(a, b)`, or `Ownership(Owner: a, Owned: b)`, refers to the Ownership record between a and b.
- Without labels, the arguments go in the relation's own order.
- An object passed for a parameter that sits below the object fills it through the object's record there, as the Relate view does.
- As a value, the call is the record's output, or BLANK if there's no record, and a dot can go on from it: `Ownership(Feeder, Fund).Percentage`.
- Like a reference to an empty cell, it still knows where the record would be, so `IMPLIEDBY` and `ISRULEDOUT` can ask about it.

### Functions

A first set:

| Function | Gives |
| --- | --- |
| `IF`, `IFS`, `AND`, `OR`, `NOT` | As in Excel, except that IFS with no match gives BLANK, and AND and OR stop once the answer is known, which avoids needless lookups and false loops. `AND`, `OR` and `NOT` can also go between or before their operands: `a AND NOT b`. Comparisons bind tighter than NOT, NOT tighter than AND, and AND tighter than OR. Comparing values of different kinds, like text with a number, is an error (`#VALUE!`). |
| `=`, `<>`, `<`, `>`, `<=`, `>=`, `+`, `-`, `*`, `/`, `&` | As in Excel. |
| `x IN list` | TRUE if x is one of the list's items. |
| `BLANK()`, `ISBLANK(x)` | BLANK, and whether x is BLANK. |
| `ISRULEDOUT(x)` | TRUE if x is a ruled-out tag. |
| `COUNT`, `SUM`, `MIN`, `MAX`, `AVERAGE`, `UNIQUE`, `TEXTJOIN` | As in Excel, over lists, except that COUNT counts every item, not only numbers. |
| `FILTER(list, condition)` | The items for which the condition is TRUE, with `@` as each item. |
| `ANY(list, condition)`, `ALL(list, condition)` | Whether the condition holds for some item, or for every item. |
| `EACH(list, expression)` | The list of the expression's values, with `@` as each item. |
| `LET(name, value, …, expression)` | As in Excel: names a value for use in the expression. |
| `KIND(x)` | x's kind, as text. |
| `REACH(start, list)` | Everything reached from start by following the named list one or more times. The counterpart of the statute's "directly or indirectly". |
| `LOOKTHROUGH(from, to, list, factor)` | The sum, over every way of getting from `from` to `to` by following the list, of the product of `factor` along the way. BLANK if there's no way. |
| `WITHOUT(x, expression)` | The expression, worked out as if x and everything that depends on it weren't in the chart, with every computed record recomputed. For counterfactuals like §57(b)(2)'s carve-out. |
| `IMPLIEDBY(tag, label, …)` | TRUE if the tag is attested and implied by an implication with one of the labels. |
| `TODAY`, `DATE`, `YEAR`, `YEARFRAC`, and text functions | As in Excel, added as needed. |

Some arguments name a step instead of giving a value: REACH's and LOOKTHROUGH's `list`, and LOOKTHROUGH's `factor`. They're looked up on each record along the way.

### Implications

- A tag with implications is attested wherever any of them holds. It remembers which ones held, and the records they read, for when someone asks why.
- Implications only attest. A tag can have either one `=` formula or any number of implications, not both.
- An implication's label is free text, such as "(C)", "More than 25%" or "§57(b)(2)". Several implications can share a label, and `IMPLIEDBY` then cites them as a group.
- An implication that runs into an error counts as not holding, and the error shows on its row.
- A choice formula can give any option the choice already has, or any text written in the formula itself.

### Entered records win

Where an entered record and a formula give an output for the same argumentation:

| Entered | Formula gives | The record is | The panel marks it as |
| --- | --- | --- | --- |
| a value or option | a different one | as entered | differing from the formula |
| a value or option | the same | as entered | agreeing, and offers to clear it |
| attested | attested | attested | also implied |
| ruled out | attested | ruled out | overriding the implications that hold |
| anything | nothing | as entered | (nothing) |

Other formulas read the record as it ends up. So ruling out an implied tag also takes away whatever was implied only through it.

### Loops

A formula can read records worked out by itself or by other formulas, at the same location or others. Records are worked out in the order they depend on each other, as cells are in a spreadsheet. If working out a record needs that same record, that's a loop:

- **A loop that runs only through implications,** where more attestations can only make more implications hold, settles on the fewest attestations that the implications support. That's how "directly or indirectly" definitions read, and Control is such a loop. Such a loop can run through SUM (of numbers that aren't negative), COUNT, `>`, `>=`, AND, OR, IN, FILTER, ANY, REACH and IMPLIEDBY, but not through NOT, ISBLANK, ISRULEDOUT, `<`, or a `=` formula.
- **Any other loop** is a circular reference. The records on it show `#CIRCULAR!`.

`WITHOUT` can't read the formula it's in, since that's always a loop.

### Errors

Errors show where the output would be, as in Excel, and pass on to whatever reads them:
- `#NAME?` for a name the schema doesn't have;
- `#VALUE!` for the wrong kind of value;
- `#REF!` for something deleted (see [When what a formula refers to changes](#when-what-a-formula-refers-to-changes));
- `#OPTION?` for a choice formula giving text that isn't an option, when that hasn't been confirmed;
- `#DIV/0!`;
- `#CIRCULAR!`.

## Names for relations and lists

These pilot the UI-only names discussed on 2026-10-24. Formulas use them, and so can the panel.

- **Relation names.** A relation as a whole can have a name: Ownership, Control.
  - A name covers every relation parameterization with the same root edge labels and type. For example, Ownership covers ownership by Entities, by Individuals and by Investor Groups.
  - Formulas use the name to call the relation, and as the name of a linked record's output (`@.Membership`).
  - Since it covers all the kinds at once, a relation name might also be the unit styles attach to. That would answer the open question about styles multiplying with kinds.
- **List names.** A name for the list of relatives in one role, seen from another role. Ownership's Owners are seen from Owned, and its Holdings from Owner. Without a name, a list goes by the edge label of the role it lists (Owner), as the panel's rows do now.
- **Cardinality hints.** For example, a fund has at most one general partner.
  - Formulas already use a list of one as a single value, so a hint isn't needed for them to work.
  - A hint does let the formula editor warn about a list that could have several items where one value is expected.
  - It also lets the panel show a single row, and flag data that breaks the hint.

## In terms of the data model

This section restates the above in the terms of data-model.md.

**Formulas.** A **formula** in a schema S **covers** a set of parameterizations of S that all have the same root edge labels, and whose specifications in S are either all fields of one datatype, all choices, or all tags.
- It is either a **value formula** or, if what it covers are tags, a nonempty set of **implications**.
- No parameterization is covered by two formulas.

**Candidates.** If p is a parameterization and Σ is a set of records, a **candidate** for p in Σ is an argumentation obtained from p by replacing each of its locations with a record in Σ whose underlying specification is that location. Unless a formula says otherwise, it skips candidates in which two of p's parameters are filled by records belonging to the same object.

**What a formula gives.** Take a candidate a for a parameterization p that a formula covers, and a set of records to read. A value formula **gives** an output of p at a, or nothing. An implication **holds** at a, or doesn't.
- A value formula covering choices must give an output that is one of p's outputs in S.
- Writing a new option into the formula adds a specification with that output to S.

**The computed state.** A chart has a set E of **entered** records and a set F of formulas. Its **computed state** is the set Σ of records such that a record is in Σ exactly when either:
- it is in E; or
- all of the following hold:
  - its argumentation a is a candidate in Σ for a parameterization covered by a formula f in F;
  - no record in E has argumentation a;
  - either f is a value formula that gives the record's output at a, reading Σ, or the record's output is True and one of f's implications holds at a, reading Σ.

**Σ is a state.**
- Every location of a computed record is in Σ, since candidates are built from records of Σ.
- No two records have the same argumentation. Each argumentation takes its output from E if E has a record there, and otherwise from the one formula covering it.
- E may contain records located at computed records. Such a record is part of Σ only while its location is. Otherwise it is kept aside, as deleted records are, and returns when its location does.

**Solving for Σ.** Σ appears on both sides of its own definition. A computed record **depends** on the records its formula reads at its candidate.
- If no record depends on itself, through any number of steps, there is exactly one Σ, worked out the way a spreadsheet works out its cells.
- Where records depend on themselves only through implications, and only in ways where more records can only make more implications hold, Σ is the smallest set that satisfies the definition. That is, each attestation is supported by some finite chain of implications.
- Any other record that depends on itself is left out of Σ and marked as circular.

**WITHOUT.** `WITHOUT(x, e)` reads the computed state of a chart with the same formulas F, whose entered records are E without x and its dependents.

**Entered records win.**
- Wherever E has a record with argumentation a, no formula's output at a enters Σ.
- In particular, an entered False at a candidate where an implication holds leaves the tag ruled out.
- Computing never rules a tag out, unless the tag is covered by a value formula instead of implications.

## When what a formula refers to changes

- **Renames.** Formulas keep references to specifications, not text. The text you see is rebuilt from the current labels.
  - Renaming an entry or relabeling an edge relabels every formula that refers to it, as Excel does when a table column is renamed.
  - This uses the same re-keying that already carries entry order, styles and required flags.
- **Deletion.**
  - Deleting something a formula refers to turns the reference into `#REF!` wherever it's needed, and restoring it brings the reference back.
  - Deleting a computed entry or relation deletes its formula along with it, together with any entered records located at its computed records. Restoring brings them all back.
- **Moving up a level.** References to the moved entry keep working unchanged, because names are looked up the path. For example, `Controlled.[Entity Type].[Manager-Managed]` still finds Manager-Managed after it moves from Entity Type up to the entity, by looking up the path from Entity Type.
- **Editing a formula.** Editing a formula, or adding or removing an implication, recomputes everything that depends on it, as one undoable step.
- **From entered to computed.** Giving a formula to an entry or relation that already has entered records keeps them as entered.
  - Where they agree with the formula, they're marked so, and the panel offers to clear them.
  - Where they don't agree, they're overrides.
- **From computed to entered.** "Keep as entered" records a computed record's current output by hand. For a whole formula at once, it works like Excel's Paste Values.

## Charts, views and workbooks

A workbook holds charts.
- Each chart has its own records, schema and formulas, which aren't synced with other charts.
- A chart has views. They share the chart's records, schema and formulas, and differ only in their styles and in what they show or hide.
- Formulas belong to the chart, so every view has the same computed records. Each view decides whether and how they show, as it does for entered records.

Take the case of adding a 40 Act view to a chart:
- **Removing the ownership lines.** In the new view, the user hides the Ownership lines. Hiding is per view: the records stay, and other views still show them.
- **Adding Close Affiliate lines.** These are computed records, drawn by the view's style for Close Affiliate.
  - If Close Affiliate isn't defined yet, the user defines it from that view. The definition joins the chart, so every view has its records.
  - Its new style shows them only in the view it was defined from. Other views start with it hidden, so defining a relation in one view doesn't redraw the others.
- **Delete versus hide.** In a view, removing a line could mean hiding it there or deleting it from the chart. The prototype:
  - Delete on an entered box or line asks: delete it from every view, or hide it in this one.
  - Hide is also its own command, and a Hidden menu brings back what's hidden.
  - A computed line can't be deleted, so for it, Delete offers Hide, or for a tag, Rule out.

Charts don't share formulas. The prototype reuses a definition such as Affiliated Person by copying it: the chart menu's "Copy formulas from" brings another chart's definitions and relation names into this one, and the two are unsynced from then on. A workbook-level library that charts follow is the alternative (see the questions below).

## In the panel and on the chart

As built in the prototype:

- **Where formulas are written.**
  - An entry's edit form, and an entered relation's own panel, show the definition that covers it, editable in place, or "Add a formula".
  - Typing a value that starts with `=` into a field's or choice's value box makes it the formula for every location like it, as in Excel. A new tag's row has a box for `← condition` that does the same.
  - The Formulas view, reached from All, from Add › Formula… and from the chart's Formulas tab, lists every definition. It opens each one in an editor, and has a Names section for relation names and list names.
  - The Relate view's form for a new kind of relation offers "Worked out by formula instead…".
  - In the editor:
    - implications are rows, each with a label and a formula, dragged to reorder;
    - syntax problems are underlined as you type;
    - `<-` becomes `←`;
    - names are offered from what's reachable at that point.
- **How computed records look.**
  - Computed values are italic, and an implied tag's checkbox is outlined rather than filled.
  - An "fx" mark after each opens why it's there: the definition, the implications that held, and the records each read.
  - Computed rows can't be deleted. They offer "Keep as entered" and "Edit formula" instead.
  - Rows of computed relations start collapsed, with a count and the first few names.
  - Errors show in red in place.
- **Overrides.**
  - An entered record that a formula also covers gets a corner mark, as in Excel: amber where it differs or overrides, grey where it agrees or is also implied. Its explanation offers "Use formula".
  - Ruling out an implied tag asks first, naming the implications that hold.
- **On the chart.**
  - Computed relations are drawn only where a view's style shows them. View › Relations turns each relation on or off for the view, and gives a computed one a dashed line in its own color.
  - Computed text and line labels are italic.
  - The Formulas tab has Definitions, Computed relation, Computed entry and Why?, and shows how long the last working-out took and how many errors there are.

## The prototype

Everything above is built into the mockups in [UI/mockups](UI/mockups/), so it can be tried:
- **[chart.html](UI/mockups/chart.html) and [record-panel.html](UI/mockups/record-panel.html).** The sample comes with every example in this document, worked out live as the chart changes.
  - The chart has two views: Structure, and 40 Act, which hides ownership and draws the BDC's close and remote affiliates.
  - The workbook can hold more charts, each with its own records and formulas, from the chart menu in the top bar.
  - See [UI/README.md](UI/README.md) for how to write and edit formulas there.
- **[formula-lab.html](UI/mockups/formula-lab.html).** The definitions side by side with their results, and a scratch box that works out any expression at any record. Open it with `#selftest` to check the results this document claims.
- **[formulas.js](UI/mockups/app/formulas.js).** The engine. A definition there names what it covers by locations written as paths from a kind, like `Entity › Entity Type: Limited Partnership`. Computed records get ids made from their argumentation, so they keep them from one working-out to the next.

Where the prototype differs from this document:
- **Loops are found per definition, not per record.** A group of definitions that read each other and mix `=` and `←` is marked circular as a whole, even where no record actually depends on itself.
- **Renames.**
  - What a formula covers follows renames and moves, as styles do.
  - Renaming an entry, or a relation's edge, offers "here only" or "every one like it", defaulting to every one.
  - Every one relabels all the entered records like it, together with the formulas and names that use the label, in one undoable step.
  - "Like" ignores the kinds a relation relates and the options above an entry, so renaming one ownership's Percentage reaches all twelve.

## Open questions

### The language

1. **Syntax.** Do these read well: `@`, the bracketed names, dots that look at the linking relation first, and EACH, FILTER, ANY and REACH?
2. **BLANK.** Should BLANK keep Excel's habit of counting as 0? For legal analysis, a missing percentage arguably makes a sum unknown rather than smaller.
3. **Exceptions.** Should a tag have an "unless" line that applies to all its implications, like `AND NOT [Close Affiliate](…)` on each of Remote Affiliate's? And should an implication ever be able to rule out, rather than only attest?
4. **Naming a particular object.** A formula can't name one object, like "the close affiliates of Fund III". Should it? It would be needed for showing or hiding by formula in a view.
5. **Relation names and edge labels.** Should a relation's name be allowed to equal one of its edge labels? Close Affiliate's is, which is why a dot gives the edge there.

### What formulas cover, and names

6. **What a formula covers.** One idea: the editor proposes every parameterization with the same edge labels at locations of the same kinds, and you narrow it down. That is how Tax Classification's formula covers three Entity Types. Should relation names be the unit for this, and for styles?
7. **Cardinality hints.** Should a hint be enforced, or only warned about?

### Overrides

8. **Rebuttals.** Should an override that rules out an implied tag ask for its basis?
9. **Override marks.** Is an Excel-like corner mark clear enough, or should an override say so in words?
10. **Typing `=` over an entered value.** Should the value be kept as an override, rather than replaced by the formula's output? For now it's kept only when something is located at it.

### The panel

11. **Rows for relations located below an object.** The BDC's Close Affiliates sit under its Investment Company Status, where the relation is located, not with the BDC's other rows. Should a panel also show them at the object?
12. **Computed rows.** These now start collapsed. Should each row's collapsed state be remembered instead, or should there be one "Show computed" switch?
13. **What a rename reaches.** Renaming "every one like it" ignores kinds and options above the entry. Is that right? It means renaming one entity's Tax Classification would reach every Entity Type's.
14. **Here-only renames of an edge.** These make the record a different relation, which drops out of its name, its formulas and its styles. Is that ever useful, or should an edge rename always reach every relation like it?

### Views and workbooks

15. **Views.** The prototype makes these choices; are they right?
    - Box positions belong to each view, so moving a box in 40 Act leaves Structure alone.
    - A new view ("+") starts as a copy of the current one. It could instead start from the Structure view's styles, with nothing hidden.
    - Delete asks whether to delete everywhere or hide in this view.
    - Should a view be able to show or hide by formula, for example only the close affiliates of a given fund? In the 40 Act view, most of the chart is a close affiliate of the BDC.
    - Should Show and Hide also work on boxes by kind, and on a box's lines of text by entry?
16. **Workbooks.** Charts in the prototype reuse formulas by copying them. Should a workbook instead have a library of definitions (Affiliated Person, Close Affiliate) that its charts follow, so a fix to one reaches them all?
