# The sample chart's vocabulary

What `vocab` says of the sample workbook (`app/sample/calder-ridge.js`), which `new` begins a chart from, for orientation before there's a workbook to ask. A firm's own chart may differ: run `vocab` on it, and go by that.

Made with `sh scripts/dendra.sh vocab <the sample as a .dendra.json>`.

```text
Calder Ridge Fund III structure: what can be recorded

An entry marked “worked out” is Dendra’s, from a formula: leave it out. “Required” is counted blank until given;
“a check” is counted an error where it fails. “Starts it” and “ends it” are dates that bound when the record holds.

KINDS (an object of each is a box on a chart)

Entity
  Name: text
  Short Name: text
  Vehicle Type: one of “Main Fund”, “Parallel Fund”, “Feeder Fund”, “AIV”, “Co-Investment Vehicle”, “Business Development Company”, “General Partner”, “Management Company”, “Holding Company”, “Blocker”, “Portfolio Company” or “Third Party” · required
  Entity Type: one of “Limited Partnership”, “Exempted Limited Partnership”, “Limited Liability Company”, “Corporation”, “Exempted Company” or “Governmental Plan” · required
    at “Limited Partnership”:
      Formation Document on File: a checkbox · worked out (Formation Document on File) · a check
      Governing Agreement on File: a checkbox · worked out (Governing Agreement on File) · a check
      Tax Classification: one of “C Corporation”, “Disregarded Entity” or “Partnership” · worked out (Tax Classification)
    at “Limited Liability Company”:
      Formation Document on File: a checkbox · worked out (Formation Document on File) · a check
      Governing Agreement on File: a checkbox · worked out (Governing Agreement on File) · a check
      Manager-Managed: a checkbox
      Tax Classification: one of “C Corporation”, “Disregarded Entity” or “Partnership” · worked out (Tax Classification)
    at “Corporation”:
      Authorized Shares: number
      Formation Document on File: a checkbox · worked out (Formation Document on File) · a check
      Governing Agreement on File: a checkbox · worked out (Governing Agreement on File) · a check
      Tax Classification: one of “C Corporation”, “Disregarded Entity”, “Partnership” or “Regulated Investment Company” · worked out (Tax Classification)
    at “Exempted Limited Partnership”:
      Formation Document on File: a checkbox · worked out (Formation Document on File) · a check
      Governing Agreement on File: a checkbox · worked out (Governing Agreement on File) · a check
    at “Exempted Company”:
      Formation Document on File: a checkbox · worked out (Formation Document on File) · a check
      Governing Agreement on File: a checkbox · worked out (Governing Agreement on File) · a check
  Jurisdiction: one of “Delaware”, “Cayman Islands”, “Alabama”, “Alaska”, “Arizona”, “Arkansas”, “California”, “Colorado”, “Connecticut”, “District of Columbia”, “Florida”, “Georgia”, “Hawaii”, “Idaho”, “Illinois”, “Indiana”, “Iowa”, “Kansas”, “Kentucky”, “Louisiana”, “Maine”, “Maryland”, “Massachusetts”, “Michigan”, “Minnesota”, “Mississippi”, “Missouri”, “Montana”, “Nebraska”, “Nevada”, “New Hampshire”, “New Jersey”, “New Mexico”, “New York”, “North Carolina”, “North Dakota”, “Ohio”, “Oklahoma”, “Oregon”, “Pennsylvania”, “Rhode Island”, “South Carolina”, “South Dakota”, “Tennessee”, “Texas”, “Utah”, “Vermont”, “Virginia”, “Washington”, “West Virginia”, “Wisconsin”, “Wyoming”, “Bermuda”, “British Virgin Islands”, “England and Wales”, “Guernsey”, “Hong Kong”, “Ireland”, “Jersey”, “Luxembourg”, “Netherlands” or “Singapore” · required
    at “Cayman Islands”:
      Annual Return Due: date · worked out (Annual Return Due)
      Annual Return Filed: date
      Registered Office: text
      Registration Number: text
    at “Delaware”:
      File Number: text
  Formation Date: date · required · starts it
  Fiscal Year End: day of the year
    The day each fiscal year ends.
  EIN: text
  LEI Registered: a checkbox
    at checked:
      Last Renewed: date
      LEI: text
      Next Renewal: date · worked out (Next Renewal)
      Registered On: date
  Good Standing: a checkbox
  3(c)(1) Count: number · worked out (3(c)(1) Count)
    How many beneficial owners section 3(c)(1) counts for a 3(c)(1) fund: one for each owner, an investor group for the beneficial owners it records, and a private fund that owns 10% or more for its…
  4.13(a)(3) Exemption: a checkbox
    at checked:
      Affirmation Due: date · worked out (Affirmation Due)
      Claimed On: date
      Last Affirmed: date
  BDC Affiliate: a checkbox · worked out (BDC Affiliate)
    A person that is the BDC, or a close or remote affiliate of it.
  CIMA Registered: a checkbox
    at checked:
      Annual Fee Due: date · worked out (Annual Fee Due)
      Audited Accounts Due: date · worked out (Audited Accounts Due)
      Audited Accounts Filed: date
      CIMA Number: text
      Last Paid: date
      Registered On: date
  Dissolution Date: date · ends it
  ERISA Plan Assets: a checkbox
  Investment Company: a checkbox · worked out (Investment Company)
    An investment company under the Investment Company Act; here, a business development company.
  Investment Company Status: one of “3(c)(7) Fund”, “Business Development Company” or “Unit Investment Trust”
    at “Business Development Company”:
      1940 Act File Number: text
  Ownership Adds Up: a checkbox · worked out (Ownership Adds Up) · a check
    Whether the owners charted hold 100% of the entity.
  Private Fund: a checkbox · worked out (Private Fund)
    A fund that would be an investment company but for section 3(c)(1) or 3(c)(7) of the Investment Company Act.
  Registered Investment Adviser: a checkbox
    at checked:
      CRD Number: text
      Form ADV Due: date · worked out (Form ADV Due)
      Form PF Filer: a checkbox
        at checked:
          Form PF Due: date · worked out (Form PF Due)
          Last Annual Update: date
      Last Annual Amendment: date
      Registered On: date
      SEC File Number: text
  Regulation D Offering: a checkbox
    at checked:
      File Number: text
      First Sale: date
      Form D Due: date · worked out (Form D Due)
      Last Filed: date
      Offering Open: a checkbox
  Target Commitments: money
  TIA Registered: a checkbox
    Registered with the Cayman Tax Information Authority as a reporting financial institution, for FATCA and CRS.
    at checked:
      CRS Due: date · worked out (CRS Due)
      CRS Filed: date
      FATCA Due: date · worked out (FATCA Due)
      FATCA Filed: date
      Registered On: date

Individual
  Name: text
  Email: text
  U.S. Person: a checkbox
  BDC Affiliate: a checkbox · worked out (BDC Affiliate)
    A person that is the BDC, or a close or remote affiliate of it.
  Ownership Adds Up: a checkbox · worked out (Ownership Adds Up) · a check
    Whether the owners charted hold 100% of the entity.

Investor Group
  Name: text
  Beneficial Owners: number · required
    How many beneficial owners the group stands for, as section 3(c)(1) counts them.
  Ownership Adds Up: a checkbox · worked out (Ownership Adds Up) · a check
    Whether the owners charted hold 100% of the entity.

Document
  Name: text
  Document Type: one of “Advisory Agreement”, “Articles of Incorporation”, “Bylaws”, “Certificate of Formation”, “Certificate of Incorporation”, “Certificate of Limited Partnership”, “Certificate of Registration”, “Compliance Analysis”, “Consent”, “Correspondence”, “Exemptive Relief”, “Incumbency Certificate”, “Limited Partnership Agreement”, “Memorandum and Articles”, “Minutes”, “Operating Agreement”, “Policy”, “Regulatory Filing”, “Resolution”, “Side Letter” or “Tax Document” · required
  Document Date: date · required
  Status: one of “Draft”, “Final”, “Executed”, “Filed” or “Superseded” · required
  Version: text
  Link: document · required

Tax Year
  Name: text
  Year: number

Service Provider
  Name: text
  Address: text


RELATIONS (each a line or a list; its sides by their edges)

Evidence
  Document: Document
  Evidenced: a Signing Authority, a Position (Officer) or a Position (Director)

Annual Tax · worked out (Annual Tax)
  Taxpayer: Entity whose Jurisdiction is Delaware
  Tax Year: Tax Year
  The Delaware tax an entity owes for a tax year, a corporation’s franchise tax or a limited partnership’s or LLC’s annual tax: owed for every year it is on the register, at any time in the year, and…
  Annual Tax Amount: money · worked out (Annual Tax Amount)
    The Delaware annual tax of a limited partnership or LLC for the tax year: $300 through tax year 2025, $400 from tax year 2026 (HB 400).
  Annual Tax Due: date · worked out (Annual Tax Due)
    When the tax year’s Delaware tax is due, until it’s paid: a corporation’s franchise tax and annual report on or before March 1 of the next year, a limited partnership’s or LLC’s annual tax on or…
  Annual Tax Paid: date

Look-Through Ownership · percent · worked out (Look-Through Ownership)
  Investor: Entity, Individual or Investor Group
  Investment: Entity
  The share of an entity an investor holds through every chain of ownership, multiplying the percentages along each chain.

Signing Authority
  Signatory: Individual
  On Behalf Of: Entity
  Via: Entity
  Capacity: one of “Authorized Signatory”, “Director”, “General Partner”, “Managing Member” or “Officer” · required
  Start Date: date · starts it
  Limit: money
  Capacity Held: a checkbox · worked out (Capacity Held) · a check
    Whether the signatory holds the capacity it signs in at the entity it signs through: a managing member, general partner, director or officer recorded there; or, for an authorized signatory, a basis…

Position · one of “Director”, “Officer” or “Employee”
  Holder: Individual
  Company: Entity
  End Date: date · ends it
  Start Date: date · required · starts it
  Title: text · required

Investment Adviser
  Adviser: Entity
  Client: Entity

Concerns
  Document: Document
  Subject: Entity

Registered Agent
  Agent: Service Provider
  Principal: Entity whose Jurisdiction is Cayman Islands or Entity whose Jurisdiction is Delaware

Control · worked out (Control)
  Controller: Entity or Individual
  Controlled: Entity
  Section 2(a)(9): “Control” means the power to exercise a controlling influence over the management or policies of a company, unless such power is solely the result of an official position with such…

Affiliated Person · worked out (Affiliated Person)
  Affiliate: Entity or Individual
  Person: Entity or Individual
  Section 2(a)(3): “Affiliated person” of another person means—

Depositor
  Depositor: Entity or Individual
  Fund: Entity whose Investment Company Status is Unit Investment Trust
  Section 2(a)(3)(F): the depositor of a unit investment trust, the person who deposits the securities the trust holds with its trustee and sponsors it.

Close Affiliate · worked out (Close Affiliate)
  Close Affiliate: Entity or Individual
  BDC: Entity whose Investment Company Status is Business Development Company
  Section 57(b): The provisions of subsection (a) shall apply to the following persons:

Remote Affiliate · worked out (Remote Affiliate)
  Remote Affiliate: Entity or Individual
  BDC: Entity whose Investment Company Status is Business Development Company
  Section 57(e): The provisions of subsection (d) shall apply to the following persons:

Ownership
  Owner: Investor Group, Entity or Individual
  Owned: Entity
  Percentage: percent
  Percentages In Range: a checkbox · worked out (Percentages In Range) · a check
    Whether the holding’s Percentage and Voting Percentage are each from 0% to 100%: ruled out where one isn’t, as a share of a company can’t be.
  Voting Percentage: percent · worked out (Voting Percentage)
    The share of the owned company’s outstanding voting securities this holding carries, which the 25% and 5% tests of Control and Affiliated Person read.

General Partner
  GP: Entity
  Partnership: Entity whose Entity Type is Limited Partnership or Entity whose Entity Type is Exempted Limited Partnership
  Admission Date: date · starts it
  Withdrawal Date: date · ends it

Membership · one of “Managing Member” or “Member”
  Member: Individual
  LLC: Entity whose Entity Type is Limited Liability Company
```
