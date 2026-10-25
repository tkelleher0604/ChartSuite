// The sample: Calder Ridge, a fictional private fund manager, as a chart's state: its records, box positions,
// relation names, definitions, required entries, views and history. Everything in it is fictional.
//
// Its core is the sample formulas.md works its examples on, which model.html's figures, the formula lab's
// self-test and the model test check: a fund with its feeder, GP, manager and blocker, two portfolio
// companies, and a BDC for the 40 Act. The sample a chart starts from (sampleState) is that core filled out
// into the fund complex docs/sample.md describes, with the past that made it: the history of its edits.

// Records, path case only: every non-object record has exactly one location.
// `at` is the id of that location and `edge` labels the edge to it.
// The root is one of: an object (kind), a field (datatype + value), a choice (text) or a tag (Boolean).
// Labels, choices and kinds are matched without regard to case, but shown as written.
const SAMPLE_CORE = {
  fund:            { kind: 'Entity' },
  fund_name:       { at: 'fund', edge: 'Name', field: 'text', value: 'Calder Ridge Capital Partners III, L.P.' },
  fund_formed:     { at: 'fund', edge: 'Formation Date', field: 'date', value: '2023-02-14' },
  fund_ein:        { at: 'fund', edge: 'EIN', field: 'text', value: '92-4810337' },
  fund_fye:        { at: 'fund', edge: 'Fiscal Year End', field: 'text', value: 'December 31' },
  fund_target:     { at: 'fund', edge: 'Target Commitments', field: 'money', value: 750000000 },
  fund_good:       { at: 'fund', edge: 'Good Standing', tag: true },
  fund_erisa:      { at: 'fund', edge: 'ERISA Plan Assets', tag: false },
  fund_vehicle:    { at: 'fund', edge: 'Vehicle Type', choice: 'Main Fund' },
  fund_juris:      { at: 'fund', edge: 'Jurisdiction', choice: 'Delaware' },
  fund_file:       { at: 'fund_juris', edge: 'File Number', field: 'text', value: '7351234' },
  fund_agent:      { at: 'fund_juris', edge: 'Registered Agent', field: 'text', value: 'The Corporation Trust Company' },
  fund_type:       { at: 'fund', edge: 'Entity Type', choice: 'Limited Partnership' },
  fund_tax:        { at: 'fund_type', edge: 'Tax Classification', choice: 'Partnership' },
  fund_ics:        { at: 'fund', edge: 'Investment Company Status', choice: '3(c)(7) Fund' },

  feeder:          { kind: 'Entity' },
  feeder_name:     { at: 'feeder', edge: 'Name', field: 'text', value: 'Calder Ridge Capital Partners III (Cayman), L.P.' },
  feeder_formed:   { at: 'feeder', edge: 'Formation Date', field: 'date', value: '2023-03-01' },
  feeder_good:     { at: 'feeder', edge: 'Good Standing', tag: true },
  feeder_vehicle:  { at: 'feeder', edge: 'Vehicle Type', choice: 'Feeder Fund' },
  feeder_juris:    { at: 'feeder', edge: 'Jurisdiction', choice: 'Cayman Islands' },
  feeder_reg:      { at: 'feeder_juris', edge: 'Registration Number', field: 'text', value: 'OG-104582' },
  feeder_office:   { at: 'feeder_juris', edge: 'Registered Office', field: 'text', value: 'PO Box 1200, George Town, Grand Cayman KY1-1102' },
  feeder_type:     { at: 'feeder', edge: 'Entity Type', choice: 'Exempted Limited Partnership' },
  feeder_ics:      { at: 'feeder', edge: 'Investment Company Status', choice: '3(c)(7) Fund' },

  gp:              { kind: 'Entity' },
  gp_name:         { at: 'gp', edge: 'Name', field: 'text', value: 'Calder Ridge Capital GP III, LLC' },
  gp_formed:       { at: 'gp', edge: 'Formation Date', field: 'date', value: '2023-02-10' },
  gp_ein:          { at: 'gp', edge: 'EIN', field: 'text', value: '92-4810115' },
  gp_good:         { at: 'gp', edge: 'Good Standing', tag: true },
  gp_vehicle:      { at: 'gp', edge: 'Vehicle Type', choice: 'General Partner' },
  gp_juris:        { at: 'gp', edge: 'Jurisdiction', choice: 'Delaware' },
  gp_file:         { at: 'gp_juris', edge: 'File Number', field: 'text', value: '7349876' },
  gp_agent:        { at: 'gp_juris', edge: 'Registered Agent', field: 'text', value: 'The Corporation Trust Company' },
  gp_type:         { at: 'gp', edge: 'Entity Type', choice: 'Limited Liability Company' },
  gp_tax:          { at: 'gp_type', edge: 'Tax Classification', choice: 'Partnership' },

  mgmt:            { kind: 'Entity' },
  mgmt_name:       { at: 'mgmt', edge: 'Name', field: 'text', value: 'Calder Ridge Capital Management, LLC' },
  mgmt_formed:     { at: 'mgmt', edge: 'Formation Date', field: 'date', value: '2018-06-05' },
  mgmt_ein:        { at: 'mgmt', edge: 'EIN', field: 'text', value: '83-0915524' },
  mgmt_good:       { at: 'mgmt', edge: 'Good Standing', tag: true },
  mgmt_ria:        { at: 'mgmt', edge: 'Registered Investment Adviser', tag: true },
  mgmt_sec:        { at: 'mgmt_ria', edge: 'SEC File Number', field: 'text', value: '801-123456' },
  mgmt_crd:        { at: 'mgmt_ria', edge: 'CRD Number', field: 'text', value: '312345' },
  mgmt_vehicle:    { at: 'mgmt', edge: 'Vehicle Type', choice: 'Management Company' },
  mgmt_juris:      { at: 'mgmt', edge: 'Jurisdiction', choice: 'Delaware' },
  mgmt_file:       { at: 'mgmt_juris', edge: 'File Number', field: 'text', value: '6894512' },
  mgmt_type:       { at: 'mgmt', edge: 'Entity Type', choice: 'Limited Liability Company' },
  mgmt_managed:    { at: 'mgmt_type', edge: 'Manager-Managed', tag: true },
  mgmt_tax:        { at: 'mgmt_type', edge: 'Tax Classification', choice: 'Partnership' },

  blocker:         { kind: 'Entity' },
  blocker_name:    { at: 'blocker', edge: 'Name', field: 'text', value: 'Calder Ridge III Blocker, Inc.' },
  blocker_formed:  { at: 'blocker', edge: 'Formation Date', field: 'date', value: '2023-05-22' },
  blocker_good:    { at: 'blocker', edge: 'Good Standing', tag: false },
  blocker_vehicle: { at: 'blocker', edge: 'Vehicle Type', choice: 'Blocker' },
  blocker_juris:   { at: 'blocker', edge: 'Jurisdiction', choice: 'Delaware' },
  blocker_file:    { at: 'blocker_juris', edge: 'File Number', field: 'text', value: '7412203' },
  blocker_type:    { at: 'blocker', edge: 'Entity Type', choice: 'Corporation' },
  blocker_shares:  { at: 'blocker_type', edge: 'Authorized Shares', field: 'number', value: 1000 },
  blocker_tax:     { at: 'blocker_type', edge: 'Tax Classification', choice: 'C Corporation' },

  northpine:       { kind: 'Entity' },
  northpine_name:  { at: 'northpine', edge: 'Name', field: 'text', value: 'Northpine Software, LLC' },
  northpine_vehicle: { at: 'northpine', edge: 'Vehicle Type', choice: 'Portfolio Company' },
  northpine_juris: { at: 'northpine', edge: 'Jurisdiction', choice: 'Delaware' },
  northpine_type:  { at: 'northpine', edge: 'Entity Type', choice: 'Limited Liability Company' },

  halvard:         { kind: 'Entity' },
  halvard_name:    { at: 'halvard', edge: 'Name', field: 'text', value: 'Halvard Logistics Holdings, Inc.' },
  halvard_vehicle: { at: 'halvard', edge: 'Vehicle Type', choice: 'Portfolio Company' },
  halvard_juris:   { at: 'halvard', edge: 'Jurisdiction', choice: 'Delaware' },
  halvard_type:    { at: 'halvard', edge: 'Entity Type', choice: 'Corporation' },

  chen:            { kind: 'Individual' },
  chen_name:       { at: 'chen', edge: 'Name', field: 'text', value: 'Margaret A. Chen' },
  chen_email:      { at: 'chen', edge: 'Email', field: 'text', value: 'mchen@example.com' },
  chen_us:         { at: 'chen', edge: 'U.S. Person', tag: true },

  okafor:          { kind: 'Individual' },
  okafor_name:     { at: 'okafor', edge: 'Name', field: 'text', value: 'David R. Okafor' },
  okafor_email:    { at: 'okafor', edge: 'Email', field: 'text', value: 'dokafor@example.com' },
  okafor_us:       { at: 'okafor', edge: 'U.S. Person', tag: true },

  // A business development company the manager also advises, which co-invests in Northpine, with an
  // independent director and an outside holder: enough for the 40 Act formulas to find close and remote
  // affiliates (see formulas.md). As a BDC it elected to be taxed as a RIC, which overrides the default
  // tax classification the sample's formula gives a corporation.
  bdc:             { kind: 'Entity' },
  bdc_name:        { at: 'bdc', edge: 'Name', field: 'text', value: 'Calder Ridge Capital BDC, Inc.' },
  bdc_formed:      { at: 'bdc', edge: 'Formation Date', field: 'date', value: '2021-09-08' },
  bdc_good:        { at: 'bdc', edge: 'Good Standing', tag: true },
  bdc_vehicle:     { at: 'bdc', edge: 'Vehicle Type', choice: 'Business Development Company' },
  bdc_juris:       { at: 'bdc', edge: 'Jurisdiction', choice: 'Maryland' },
  bdc_type:        { at: 'bdc', edge: 'Entity Type', choice: 'Corporation' },
  bdc_tax:         { at: 'bdc_type', edge: 'Tax Classification', choice: 'Regulated Investment Company' },
  bdc_ics:         { at: 'bdc', edge: 'Investment Company Status', choice: 'Business Development Company' },
  bdc_file:        { at: 'bdc_ics', edge: '1940 Act File Number', field: 'text', value: '814-01523' },

  pension:         { kind: 'Entity' },
  pension_name:    { at: 'pension', edge: 'Name', field: 'text', value: 'Northstar Teachers’ Retirement System' },
  pension_formed:  { at: 'pension', edge: 'Formation Date', field: 'date', value: '1947-07-01' },
  pension_type:    { at: 'pension', edge: 'Entity Type', choice: 'Governmental Plan' },

  raman:           { kind: 'Individual' },
  raman_name:      { at: 'raman', edge: 'Name', field: 'text', value: 'Priya N. Raman' },
  raman_email:     { at: 'raman', edge: 'Email', field: 'text', value: 'praman@example.com' },

  // A kind a user added for the chart, which starts out with the preset style.
  inv_us:          { kind: 'Investor Group' },
  inv_us_name:     { at: 'inv_us', edge: 'Name', field: 'text', value: 'U.S. Investors' },
  inv_nonus:       { kind: 'Investor Group' },
  inv_nonus_name:  { at: 'inv_nonus', edge: 'Name', field: 'text', value: 'Non-U.S. and U.S. Tax-Exempt Investors' },

  // Relations: entries with more than one location. Each argument is an edge label and a location id,
  // listed in a fixed order that the panels follow when they lay arguments out side by side, and that
  // the chart follows when it draws a line from the first argument to the second.

  // A tag relating a GP to the fund it manages. The fund's side sits at its Entity Type, not at the entity.
  gp_of_fund:      { args: [{ edge: 'GP', at: 'gp' }, { edge: 'Fund Owned', at: 'fund_type' }], tag: true },
  gp_of_feeder:    { args: [{ edge: 'GP', at: 'gp' }, { edge: 'Fund Owned', at: 'feeder_type' }], tag: true },
  gp_admitted:     { at: 'gp_of_fund', edge: 'Admission Date', field: 'date', value: '2023-02-14' },

  // Ownership: a tag relating owner and owned, with the Percentage owned located at it, so that more can be
  // recorded about an ownership (its class of interest, say) and formulas can read it (see formulas.md).
  own_us_fund:     { args: [{ edge: 'Owner', at: 'inv_us' }, { edge: 'Owned', at: 'fund' }], tag: true },
  own_us_fund_pct: { at: 'own_us_fund', edge: 'Percentage', field: 'percent', value: 0.716 },
  own_nonus_fdr:   { args: [{ edge: 'Owner', at: 'inv_nonus' }, { edge: 'Owned', at: 'feeder' }], tag: true },
  own_nonus_fdr_pct: { at: 'own_nonus_fdr', edge: 'Percentage', field: 'percent', value: 1 },
  own_fund_blkr:   { args: [{ edge: 'Owner', at: 'fund' }, { edge: 'Owned', at: 'blocker' }], tag: true },
  own_fund_blkr_pct: { at: 'own_fund_blkr', edge: 'Percentage', field: 'percent', value: 1 },
  own_fund_npine:  { args: [{ edge: 'Owner', at: 'fund' }, { edge: 'Owned', at: 'northpine' }], tag: true },
  own_fund_npine_pct: { at: 'own_fund_npine', edge: 'Percentage', field: 'percent', value: 0.64 },
  own_blkr_hlvd:   { args: [{ edge: 'Owner', at: 'blocker' }, { edge: 'Owned', at: 'halvard' }], tag: true },
  own_blkr_hlvd_pct: { at: 'own_blkr_hlvd', edge: 'Percentage', field: 'percent', value: 0.82 },
  own_fdr_fund:    { args: [{ edge: 'Owner', at: 'feeder' }, { edge: 'Owned', at: 'fund' }], tag: true },
  own_fdr_fund_pct: { at: 'own_fdr_fund', edge: 'Percentage', field: 'percent', value: 0.284 },
  own_chen_mgmt:   { args: [{ edge: 'Owner', at: 'chen' }, { edge: 'Owned', at: 'mgmt' }], tag: true },
  own_chen_mgmt_pct: { at: 'own_chen_mgmt', edge: 'Percentage', field: 'percent', value: 0.6 },
  own_okfr_mgmt:   { args: [{ edge: 'Owner', at: 'okafor' }, { edge: 'Owned', at: 'mgmt' }], tag: true },
  own_okfr_mgmt_pct: { at: 'own_okfr_mgmt', edge: 'Percentage', field: 'percent', value: 0.4 },
  own_chen_gp:     { args: [{ edge: 'Owner', at: 'chen' }, { edge: 'Owned', at: 'gp' }], tag: true },
  own_chen_gp_pct: { at: 'own_chen_gp', edge: 'Percentage', field: 'percent', value: 0.5 },
  own_okfr_gp:     { args: [{ edge: 'Owner', at: 'okafor' }, { edge: 'Owned', at: 'gp' }], tag: true },
  own_okfr_gp_pct: { at: 'own_okfr_gp', edge: 'Percentage', field: 'percent', value: 0.5 },
  own_bdc_npine:   { args: [{ edge: 'Owner', at: 'bdc' }, { edge: 'Owned', at: 'northpine' }], tag: true },
  own_bdc_npine_pct: { at: 'own_bdc_npine', edge: 'Percentage', field: 'percent', value: 0.12 },
  own_pens_bdc:    { args: [{ edge: 'Owner', at: 'pension' }, { edge: 'Owned', at: 'bdc' }], tag: true },
  own_pens_bdc_pct: { at: 'own_pens_bdc', edge: 'Percentage', field: 'percent', value: 0.07 },

  // Advisory relationships: a tag relating an investment adviser to a client.
  adv_fund:        { args: [{ edge: 'Adviser', at: 'mgmt' }, { edge: 'Client', at: 'fund' }], tag: true },
  adv_feeder:      { args: [{ edge: 'Adviser', at: 'mgmt' }, { edge: 'Client', at: 'feeder' }], tag: true },
  adv_bdc:         { args: [{ edge: 'Adviser', at: 'mgmt' }, { edge: 'Client', at: 'bdc' }], tag: true },

  // Positions: a choice relating a person to a company, whose options are the positions 57(b)(1) lists.
  pos_chen_bdc:    { args: [{ edge: 'Holder', at: 'chen' }, { edge: 'Company', at: 'bdc' }], choice: 'Director' },
  pos_okfr_bdc:    { args: [{ edge: 'Holder', at: 'okafor' }, { edge: 'Company', at: 'bdc' }], choice: 'Officer' },
  pos_raman_bdc:   { args: [{ edge: 'Holder', at: 'raman' }, { edge: 'Company', at: 'bdc' }], choice: 'Director' },
  pos_okfr_mgmt:   { args: [{ edge: 'Holder', at: 'okafor' }, { edge: 'Company', at: 'mgmt' }], choice: 'Officer' },

  // LLC membership: a choice relating a member to an LLC, by way of its Entity Type.
  mem_chen_gp:     { args: [{ edge: 'Member', at: 'chen' }, { edge: 'LLC', at: 'gp_type' }], choice: 'Managing Member' },
  mem_okfr_gp:     { args: [{ edge: 'Member', at: 'okafor' }, { edge: 'LLC', at: 'gp_type' }], choice: 'Member' },
  mem_chen_mgmt:   { args: [{ edge: 'Member', at: 'chen' }, { edge: 'LLC', at: 'mgmt_type' }], choice: 'Managing Member' },
  mem_okfr_mgmt:   { args: [{ edge: 'Member', at: 'okafor' }, { edge: 'LLC', at: 'mgmt_type' }], choice: 'Member' },

  // Signing authority, with three arguments: who signs, through which entity, for which entity.
  // Signing for the management company directly makes "Via" and "On Behalf Of" the same location.
  sign_chen_fund:  { args: [{ edge: 'Signatory', at: 'chen' }, { edge: 'Via', at: 'gp' }, { edge: 'On Behalf Of', at: 'fund' }], tag: true },
  sign_okfr_fund:  { args: [{ edge: 'Signatory', at: 'okafor' }, { edge: 'Via', at: 'gp' }, { edge: 'On Behalf Of', at: 'fund' }], tag: true },
  sign_chen_fdr:   { args: [{ edge: 'Signatory', at: 'chen' }, { edge: 'Via', at: 'gp' }, { edge: 'On Behalf Of', at: 'feeder' }], tag: true },
  sign_chen_mgmt:  { args: [{ edge: 'Signatory', at: 'chen' }, { edge: 'Via', at: 'mgmt' }, { edge: 'On Behalf Of', at: 'mgmt' }], tag: true },
  sign_okfr_mgmt:  { args: [{ edge: 'Signatory', at: 'okafor' }, { edge: 'Via', at: 'mgmt' }, { edge: 'On Behalf Of', at: 'mgmt' }], tag: false },
};

// Where each object's box sits on the chart: its top-left corner and width. Height follows from its text.
const SAMPLE_CORE_LAYOUT = {
  inv_nonus: { x: 40, y: 40, w: 200 },
  inv_us:    { x: 345, y: 40, w: 200 },
  feeder:    { x: 25, y: 150, w: 230 },
  chen:      { x: 650, y: 150, w: 170 },
  okafor:    { x: 870, y: 150, w: 170 },
  fund:      { x: 330, y: 330, w: 230 },
  gp:        { x: 640, y: 350, w: 200 },
  mgmt:      { x: 860, y: 350, w: 200 },
  blocker:   { x: 240, y: 545, w: 200 },
  northpine: { x: 520, y: 545, w: 200 },
  halvard:   { x: 240, y: 690, w: 200 },
  pension:   { x: 1330, y: 40, w: 220 },
  raman:     { x: 1090, y: 150, w: 170 },
  bdc:       { x: 1320, y: 350, w: 220 },
};

// The pilot's names for relations as a whole, and for their lists of relatives seen from each side
// (formulas.md, "Names for relations and lists"). A list without a name goes by the edge label it lists.
// The last three are the fund complex's: what a document is about, who a registered agent acts for, and
// the record a document is evidence of.
const SAMPLE_NAMES = { relations: [
  { name: 'Ownership', type: 'tag', edges: ['Owner', 'Owned'], lists: { Owned: { Owner: 'Owners' }, Owner: { Owned: 'Holdings' } } },
  { name: 'General Partner', type: 'tag', edges: ['GP', 'Fund Owned'], lists: { 'Fund Owned': { GP: 'General Partners' }, GP: { 'Fund Owned': 'Funds' } } },
  { name: 'Membership', type: 'choice', edges: ['Member', 'LLC'], lists: { LLC: { Member: 'Members' }, Member: { LLC: 'LLCs' } } },
  { name: 'Signing Authority', type: 'tag', edges: ['Signatory', 'Via', 'On Behalf Of'], lists: {} },
  { name: 'Position', type: 'choice', edges: ['Holder', 'Company'], lists: { Company: { Holder: 'Personnel' }, Holder: { Company: 'Positions' } } },
  { name: 'Investment Adviser', type: 'tag', edges: ['Adviser', 'Client'], lists: { Client: { Adviser: 'Advisers' }, Adviser: { Client: 'Clients' } } },
  { name: 'Look-Through Ownership', type: 'field', edges: ['Investor', 'Investment'],
    lists: { Investment: { Investor: 'Look-Through Investors' }, Investor: { Investment: 'Look-Through Investments' } } },
  { name: 'Control', type: 'tag', edges: ['Controller', 'Controlled'], lists: { Controlled: { Controller: 'Controllers' }, Controller: { Controlled: 'Controlled Companies' } } },
  { name: 'Affiliated Person', type: 'tag', edges: ['Affiliate', 'Person'], lists: { Person: { Affiliate: 'Affiliates' }, Affiliate: { Person: 'Affiliated With' } } },
  { name: 'Close Affiliate', type: 'tag', edges: ['Close Affiliate', 'BDC'], lists: { BDC: { 'Close Affiliate': 'Close Affiliates' }, 'Close Affiliate': { BDC: 'Close Affiliate Of' } } },
  { name: 'Remote Affiliate', type: 'tag', edges: ['Remote Affiliate', 'BDC'], lists: { BDC: { 'Remote Affiliate': 'Remote Affiliates' }, 'Remote Affiliate': { BDC: 'Remote Affiliate Of' } } },
  { name: 'Concerns', type: 'tag', edges: ['Document', 'Subject'], lists: { Subject: { Document: 'Documents' }, Document: { Subject: 'Subjects' } } },
  { name: 'Registered Agent', type: 'tag', edges: ['Agent', 'Principal'], lists: { Principal: { Agent: 'Registered Agents' }, Agent: { Principal: 'Principals' } } },
  { name: 'Evidence', type: 'tag', edges: ['Document', 'Evidenced'], lists: { Evidenced: { Document: 'Evidenced By' }, Document: { Evidenced: 'Evidences' } } },
] };

// The sample's formulas: formulas.md's examples, and two tags implied by an entity's Investment Company Status.
// Locations are written as paths from a kind (see formulas.js). A person, for the 40 Act, is an Entity or an Individual.
const PERSON_KINDS = ['Entity', 'Individual'];
const BDC_STATUS = 'Entity › Investment Company Status: Business Development Company';
const SAMPLE_DEFINITIONS = [
  { id: 'def_private_fund', name: 'Private Fund', type: 'tag', at: ['Entity'], implications: [
    { label: '3(c)(1) or 3(c)(7)', formula: '← [Investment Company Status] IN {"3(c)(1) Fund", "3(c)(7) Fund"}' }] },
  { id: 'def_investment_company', name: 'Investment Company', type: 'tag', at: ['Entity'], implications: [
    { label: 'BDC', formula: '← [Investment Company Status] = "Business Development Company"' }] },
  { id: 'def_adds_up', name: 'Ownership Adds Up', type: 'tag', at: ['Entity', 'Individual', 'Investor Group'],
    formula: '= IF(COUNT(Owners) = 0, BLANK(), SUM(Owners.Percentage) = 100%)' },
  { id: 'def_tax', name: 'Tax Classification', type: 'choice',
    at: ['Entity › Entity Type: Limited Partnership', 'Entity › Entity Type: Limited Liability Company', 'Entity › Entity Type: Corporation'],
    formula: '= IFS(@ = "Corporation", "C Corporation", [Ownership Adds Up] AND COUNT(Owners) = 1 AND KIND(Owners) <> "Investor Group", "Disregarded Entity", TRUE, "Partnership")' },
  { id: 'def_look_through', name: 'Look-Through Ownership', type: 'field', datatype: 'percent',
    args: [{ edge: 'Investor', at: ['Entity', 'Individual', 'Investor Group'] }, { edge: 'Investment', at: ['Entity'] }],
    formula: '= LOOKTHROUGH(Investor, Investment, Holdings, Percentage)' },
  { id: 'def_control', name: 'Control', type: 'tag', args: [{ edge: 'Controller', at: PERSON_KINDS }, { edge: 'Controlled', at: ['Entity'] }],
    implications: [
      { label: 'More than 25%', formula: '← SUM(FILTER(Controlled.Owners, @ = Controller OR @ IN REACH(Controller, [Controlled Companies])).Percentage) > 25%' },
      { label: 'General partner', formula: '← Controller IN Controlled.[General Partners]' },
      { label: 'Managing member', formula: '← Controller IN FILTER(Controlled.Members, @.Membership = "Managing Member")' },
    ] },
  { id: 'def_affiliated', name: 'Affiliated Person', type: 'tag', args: [{ edge: 'Affiliate', at: PERSON_KINDS }, { edge: 'Person', at: PERSON_KINDS }],
    implications: [
      { label: '(A)', formula: '← SUM(FILTER(Person.Owners, @ = Affiliate OR @ IN REACH(Affiliate, [Controlled Companies])).Percentage) >= 5%' },
      { label: '(B)', formula: '← IMPLIEDBY([Affiliated Person](Person, Affiliate), "(A)")' },
      { label: '(C)', formula: '← Affiliate IN REACH(Person, Controllers) OR Affiliate IN REACH(Person, [Controlled Companies]) OR ANY(REACH(Person, Controllers), Affiliate IN REACH(@, [Controlled Companies]))' },
      { label: '(D)', formula: '← Affiliate IN FILTER(Person.Personnel, @.Position <> "Advisory Board Member") OR Affiliate IN Person.[General Partners]' },
      { label: '(E)', formula: '← Person.[Investment Company] AND (Affiliate IN Person.Advisers OR Affiliate IN FILTER(Person.Personnel, @.Position = "Advisory Board Member"))' },
    ] },
  { id: 'def_close', name: 'Close Affiliate', type: 'tag', args: [{ edge: 'Close Affiliate', at: PERSON_KINDS }, { edge: 'BDC', at: [BDC_STATUS] }],
    implications: [
      { label: '(b)(1)', formula: '← [Close Affiliate] IN BDC.Personnel' },
      { label: '(b)(1) affiliates', formula: '← ANY(BDC.Personnel, IMPLIEDBY([Affiliated Person]([Close Affiliate], @), "(C)"))' },
      { label: '(b)(2)', formula: '← [Close Affiliate] IN BDC.Advisers OR [Close Affiliate] IN BDC.[General Partners]' },
      { label: '(b)(2)', formula: '← [Close Affiliate] IN REACH(BDC, Controllers)' },
      { label: '(b)(2)', formula: '← ANY(REACH(BDC, Controllers), WITHOUT(BDC, [Close Affiliate] IN REACH(@, [Controlled Companies])))' },
      { label: '(b)(2) affiliates', formula: '← ANY(BDC.[Close Affiliates], IMPLIEDBY([Close Affiliate](@, BDC), "(b)(2)") AND IMPLIEDBY([Affiliated Person]([Close Affiliate], @), "(C)", "(D)"))' },
    ] },
  { id: 'def_remote', name: 'Remote Affiliate', type: 'tag', args: [{ edge: 'Remote Affiliate', at: PERSON_KINDS }, { edge: 'BDC', at: [BDC_STATUS] }],
    implications: [
      { label: '(e)(1)(A)', formula: '← IMPLIEDBY([Affiliated Person]([Remote Affiliate], BDC), "(A)") AND NOT [Close Affiliate]([Remote Affiliate], BDC)' },
      { label: '(e)(1)(C)', formula: '← ANY(FILTER(BDC.Affiliates, IMPLIEDBY([Affiliated Person](@, BDC), "(A)")), IMPLIEDBY([Affiliated Person]([Remote Affiliate], @), "(C)")) AND NOT [Close Affiliate]([Remote Affiliate], BDC)' },
    ] },
  { id: 'def_3c1', name: '3(c)(1) Count', type: 'field', datatype: 'number', at: ['Entity'],
    formula: '= IF([Private Fund], SUM(EACH(Owners, IF(KIND(@) = "Entity" AND @.Percentage >= 10% AND @.[Private Fund], @.[3(c)(1) Count], 1))), BLANK())' },
];

// ---- The fund complex ----
// The core filled out into Calder Ridge's Fund III family, after docs/domain-research.md §5: a parallel
// fund, an AIV with its blocker, a co-invest vehicle and the portfolio companies they hold, a Cayman GP for
// the feeder, a sponsor holding company, the legal and finance team, the registered agents, the
// registrations and filings the deadlines are worked out from, and the documents, in the demo SharePoint
// library, that evidence it all.

// The demo SharePoint library the documents are kept in (see sharepoint.js), and a file's address there.
const SAMPLE_LIBRARY = 'https://contoso.sharepoint.com/sites/FundLegal/Shared%20Documents';
const inLibrary = path => `${SAMPLE_LIBRARY}/${path.split('/').map(encodeURIComponent).join('/')}`;

// Shapes the fund complex repeats, written once each: an ownership with its Percentage; a position with its
// Title and Start Date; a registered agent's relation to the jurisdiction it acts in; a document with its
// details and a Concerns relation to each entity it's about; and a document's relation to a record it's
// evidence of, such as the position an appointment letter makes.
const ownership = (id, owner, owned, percentage) => ({
  [id]: { args: [{ edge: 'Owner', at: owner }, { edge: 'Owned', at: owned }], tag: true },
  [`${id}_pct`]: { at: id, edge: 'Percentage', field: 'percent', value: percentage },
});
const positionDetails = (id, title, start) => ({
  [`${id}_title`]: { at: id, edge: 'Title', field: 'text', value: title },
  ...(start ? { [`${id}_start`]: { at: id, edge: 'Start Date', field: 'date', value: start } } : {}),
});
const position = (id, holder, company, category, title, start) => ({
  [id]: { args: [{ edge: 'Holder', at: holder }, { edge: 'Company', at: company }], choice: category },
  ...positionDetails(id, title, start),
});
const agentFor = (id, agent, jurisdiction) => ({ [id]: { args: [{ edge: 'Agent', at: agent }, { edge: 'Principal', at: jurisdiction }], tag: true } });
function indexed(id, { name, path, type, date, status, version }, subjects) {
  return {
    [id]: { kind: 'Document' },
    [`${id}_name`]: { at: id, edge: 'Name', field: 'text', value: name },
    [`${id}_link`]: { at: id, edge: 'Link', field: 'document', value: inLibrary(path) },
    [`${id}_type`]: { at: id, edge: 'Document Type', choice: type },
    ...(date ? { [`${id}_date`]: { at: id, edge: 'Document Date', field: 'date', value: date } } : {}),
    [`${id}_status`]: { at: id, edge: 'Status', choice: status },
    ...(version ? { [`${id}_version`]: { at: id, edge: 'Version', field: 'text', value: version } } : {}),
    ...Object.fromEntries(subjects.map(s => [`${id}_on_${s}`, { args: [{ edge: 'Document', at: id }, { edge: 'Subject', at: s }], tag: true }])),
  };
}
const evidence = (id, doc, record) => ({ [id]: { args: [{ edge: 'Document', at: doc }, { edge: 'Evidenced', at: record }], tag: true } });

const SAMPLE_COMPLEX = {
  // What the team calls each vehicle, which the palette finds it by.
  fund_short:      { at: 'fund', edge: 'Short Name', field: 'text', value: 'Fund III' },
  feeder_short:    { at: 'feeder', edge: 'Short Name', field: 'text', value: 'Offshore Feeder' },
  gp_short:        { at: 'gp', edge: 'Short Name', field: 'text', value: 'GP III' },
  mgmt_short:      { at: 'mgmt', edge: 'Short Name', field: 'text', value: 'The Manager' },
  blocker_short:   { at: 'blocker', edge: 'Short Name', field: 'text', value: 'Fund III Blocker' },
  bdc_short:       { at: 'bdc', edge: 'Short Name', field: 'text', value: 'The BDC' },
  holdco_short:    { at: 'holdco', edge: 'Short Name', field: 'text', value: 'Sponsor Holdings' },
  caygp_short:     { at: 'caygp', edge: 'Short Name', field: 'text', value: 'Cayman GP' },
  fund3a_short:    { at: 'fund3a', edge: 'Short Name', field: 'text', value: 'Fund III-A' },
  aiv_short:       { at: 'aiv', edge: 'Short Name', field: 'text', value: 'AIV-1' },
  aivblk_short:    { at: 'aivblk', edge: 'Short Name', field: 'text', value: 'AIV-1 Blocker' },
  coinv_short:     { at: 'coinv', edge: 'Short Name', field: 'text', value: 'Co-Invest' },

  // The core's entities, filled out: fiscal year ends, registrations, and when each recurring filing or
  // payment was last made, which the deadlines below are worked out from.
  fund_juris_tax:  { at: 'fund_juris', edge: 'Annual Tax Paid', field: 'date', value: '2026-05-27' },
  fund_lei:        { at: 'fund', edge: 'LEI Registered', tag: true },
  fund_lei_code:   { at: 'fund_lei', edge: 'LEI', field: 'text', value: '5493007CRCP3FUND0042' },
  fund_lei_on:     { at: 'fund_lei', edge: 'Registered On', field: 'date', value: '2023-11-14' },
  fund_lei_renewed: { at: 'fund_lei', edge: 'Last Renewed', field: 'date', value: '2025-11-14' },
  fund_cftc:       { at: 'fund', edge: '4.13(a)(3) Exemption', tag: true },
  fund_cftc_on:    { at: 'fund_cftc', edge: 'Claimed On', field: 'date', value: '2023-06-28' },
  fund_cftc_last:  { at: 'fund_cftc', edge: 'Last Affirmed', field: 'date', value: '2026-02-27' },
  fund_regd:       { at: 'fund', edge: 'Regulation D Offering', tag: true },
  fund_regd_file:  { at: 'fund_regd', edge: 'File Number', field: 'text', value: '021-487215' },
  fund_regd_sale:  { at: 'fund_regd', edge: 'First Sale', field: 'date', value: '2023-06-30' },
  fund_regd_filed: { at: 'fund_regd', edge: 'Last Filed', field: 'date', value: '2024-06-28' },
  fund_regd_open:  { at: 'fund_regd', edge: 'Offering Open', tag: false },

  feeder_ein:      { at: 'feeder', edge: 'EIN', field: 'text', value: '98-1702264' },
  feeder_fye:      { at: 'feeder', edge: 'Fiscal Year End', field: 'text', value: 'December 31' },
  feeder_juris_return: { at: 'feeder_juris', edge: 'Annual Return Filed', field: 'date', value: '2026-01-20' },
  feeder_cima:     { at: 'feeder', edge: 'CIMA Registered', tag: true },
  feeder_cima_no:  { at: 'feeder_cima', edge: 'CIMA Number', field: 'text', value: '1736452' },
  feeder_cima_on:  { at: 'feeder_cima', edge: 'Registered On', field: 'date', value: '2023-08-15' },
  feeder_cima_paid: { at: 'feeder_cima', edge: 'Last Paid', field: 'date', value: '2026-01-12' },
  feeder_lei:      { at: 'feeder', edge: 'LEI Registered', tag: true },
  feeder_lei_code: { at: 'feeder_lei', edge: 'LEI', field: 'text', value: '5493007CRCP3CAYM0015' },
  feeder_lei_on:   { at: 'feeder_lei', edge: 'Registered On', field: 'date', value: '2023-04-02' },
  feeder_lei_renewed: { at: 'feeder_lei', edge: 'Last Renewed', field: 'date', value: '2026-04-02' },
  feeder_cftc:     { at: 'feeder', edge: '4.13(a)(3) Exemption', tag: true },
  feeder_cftc_on:  { at: 'feeder_cftc', edge: 'Claimed On', field: 'date', value: '2023-06-28' },
  feeder_cftc_last: { at: 'feeder_cftc', edge: 'Last Affirmed', field: 'date', value: '2026-02-27' },
  feeder_regd:     { at: 'feeder', edge: 'Regulation D Offering', tag: true },
  feeder_regd_file: { at: 'feeder_regd', edge: 'File Number', field: 'text', value: '021-498806' },
  feeder_regd_sale: { at: 'feeder_regd', edge: 'First Sale', field: 'date', value: '2023-06-30' },
  feeder_regd_filed: { at: 'feeder_regd', edge: 'Last Filed', field: 'date', value: '2024-06-28' },
  feeder_regd_open: { at: 'feeder_regd', edge: 'Offering Open', tag: false },

  gp_fye:          { at: 'gp', edge: 'Fiscal Year End', field: 'text', value: 'December 31' },
  gp_juris_tax:    { at: 'gp_juris', edge: 'Annual Tax Paid', field: 'date', value: '2026-05-27' },

  mgmt_fye:        { at: 'mgmt', edge: 'Fiscal Year End', field: 'text', value: 'December 31' },
  mgmt_juris_tax:  { at: 'mgmt_juris', edge: 'Annual Tax Paid', field: 'date', value: '2026-05-27' },
  mgmt_ria_on:     { at: 'mgmt_ria', edge: 'Registered On', field: 'date', value: '2018-09-20' },
  mgmt_ria_filed:  { at: 'mgmt_ria', edge: 'Last Filed', field: 'date', value: '2026-03-28' },
  mgmt_pf:         { at: 'mgmt_ria', edge: 'Form PF Filer', tag: true },
  mgmt_pf_filed:   { at: 'mgmt_pf', edge: 'Last Filed', field: 'date', value: '2026-04-24' },
  mgmt_lei:        { at: 'mgmt', edge: 'LEI Registered', tag: true },
  mgmt_lei_code:   { at: 'mgmt_lei', edge: 'LEI', field: 'text', value: '5493007CRCMGMTLL0083' },
  mgmt_lei_on:     { at: 'mgmt_lei', edge: 'Registered On', field: 'date', value: '2019-03-10' },
  mgmt_lei_renewed: { at: 'mgmt_lei', edge: 'Last Renewed', field: 'date', value: '2026-03-10' },

  blocker_ein:     { at: 'blocker', edge: 'EIN', field: 'text', value: '92-5133076' },
  blocker_fye:     { at: 'blocker', edge: 'Fiscal Year End', field: 'text', value: 'December 31' },
  blocker_juris_frtax: { at: 'blocker_juris', edge: 'Franchise Tax Paid', field: 'date', value: '2026-02-24' },
  // In good standing again once its franchise tax was paid (the core has it lapsed).
  blocker_good:    { at: 'blocker', edge: 'Good Standing', tag: true },

  // The BDC's shares are sold privately, in an offering that's still open, so its Form D is amended yearly.
  bdc_fye:         { at: 'bdc', edge: 'Fiscal Year End', field: 'text', value: 'December 31' },
  bdc_regd:        { at: 'bdc', edge: 'Regulation D Offering', tag: true },
  bdc_regd_file:   { at: 'bdc_regd', edge: 'File Number', field: 'text', value: '021-433918' },
  bdc_regd_sale:   { at: 'bdc_regd', edge: 'First Sale', field: 'date', value: '2022-02-15' },
  bdc_regd_filed:  { at: 'bdc_regd', edge: 'Last Filed', field: 'date', value: '2025-11-10' },
  bdc_regd_open:   { at: 'bdc_regd', edge: 'Offering Open', tag: true },

  // The core's positions, with their titles and when they began. Raman's start isn't known.
  ...positionDetails('pos_chen_bdc', 'Chair of the Board', '2021-09-08'),
  ...positionDetails('pos_okfr_bdc', 'Chief Executive Officer', '2021-09-08'),
  ...positionDetails('pos_raman_bdc', 'Independent Director'),
  ...positionDetails('pos_okfr_mgmt', 'President', '2024-04-02'),

  // The sponsor's holding company, owned as the manager is, which put the BDC's seed capital in and owns
  // the feeder's Cayman GP.
  holdco:          { kind: 'Entity' },
  holdco_name:     { at: 'holdco', edge: 'Name', field: 'text', value: 'Calder Ridge Partners Holdings, LLC' },
  holdco_formed:   { at: 'holdco', edge: 'Formation Date', field: 'date', value: '2019-03-04' },
  holdco_ein:      { at: 'holdco', edge: 'EIN', field: 'text', value: '84-1279903' },
  holdco_fye:      { at: 'holdco', edge: 'Fiscal Year End', field: 'text', value: 'December 31' },
  holdco_good:     { at: 'holdco', edge: 'Good Standing', tag: true },
  holdco_vehicle:  { at: 'holdco', edge: 'Vehicle Type', choice: 'Holding Company' },
  holdco_juris:    { at: 'holdco', edge: 'Jurisdiction', choice: 'Delaware' },
  holdco_file:     { at: 'holdco_juris', edge: 'File Number', field: 'text', value: '7012298' },
  holdco_juris_tax: { at: 'holdco_juris', edge: 'Annual Tax Paid', field: 'date', value: '2026-05-27' },
  holdco_type:     { at: 'holdco', edge: 'Entity Type', choice: 'Limited Liability Company' },
  ...ownership('own_chen_holdco', 'chen', 'holdco', 0.6),
  ...ownership('own_okfr_holdco', 'okafor', 'holdco', 0.4),
  ...ownership('own_holdco_bdc', 'holdco', 'bdc', 0.03),
  mem_chen_holdco: { args: [{ edge: 'Member', at: 'chen' }, { edge: 'LLC', at: 'holdco_type' }], choice: 'Managing Member' },
  mem_okfr_holdco: { args: [{ edge: 'Member', at: 'okafor' }, { edge: 'LLC', at: 'holdco_type' }], choice: 'Member' },

  // The feeder's Cayman general partner, an exempted company, which took over from GP III in July 2024
  // (see the history).
  caygp:           { kind: 'Entity' },
  caygp_name:      { at: 'caygp', edge: 'Name', field: 'text', value: 'Calder Ridge Capital GP III (Cayman), Ltd.' },
  caygp_formed:    { at: 'caygp', edge: 'Formation Date', field: 'date', value: '2024-06-20' },
  caygp_fye:       { at: 'caygp', edge: 'Fiscal Year End', field: 'text', value: 'December 31' },
  caygp_good:      { at: 'caygp', edge: 'Good Standing', tag: true },
  caygp_vehicle:   { at: 'caygp', edge: 'Vehicle Type', choice: 'General Partner' },
  caygp_juris:     { at: 'caygp', edge: 'Jurisdiction', choice: 'Cayman Islands' },
  caygp_reg:       { at: 'caygp_juris', edge: 'Registration Number', field: 'text', value: 'CR-398114' },
  caygp_office:    { at: 'caygp_juris', edge: 'Registered Office', field: 'text', value: 'PO Box 1200, George Town, Grand Cayman KY1-1102' },
  caygp_juris_return: { at: 'caygp_juris', edge: 'Annual Return Filed', field: 'date', value: '2026-01-20' },
  caygp_type:      { at: 'caygp', edge: 'Entity Type', choice: 'Exempted Company' },
  ...ownership('own_holdco_caygp', 'holdco', 'caygp', 1),
  gp_cay_fdr:      { args: [{ edge: 'GP', at: 'caygp' }, { edge: 'Fund Owned', at: 'feeder_type' }], tag: true },
  gp_cay_fdr_admitted: { at: 'gp_cay_fdr', edge: 'Admission Date', field: 'date', value: '2024-07-01' },
  ...position('pos_chen_caygp', 'chen', 'caygp', 'Director', 'Director', '2024-06-20'),
  ...position('pos_mac_caygp', 'macallister', 'caygp', 'Director', 'Independent Director', '2025-07-01'),
  sign_chen_fdr_cay: { args: [{ edge: 'Signatory', at: 'chen' }, { edge: 'Via', at: 'caygp' }, { edge: 'On Behalf Of', at: 'feeder' }], tag: true },
  sign_mac_fdr:    { args: [{ edge: 'Signatory', at: 'macallister' }, { edge: 'Via', at: 'caygp' }, { edge: 'On Behalf Of', at: 'feeder' }], tag: true },

  // Fund III-A, the parallel fund for ERISA plans, which invests alongside Fund III from its own close on.
  fund3a:          { kind: 'Entity' },
  fund3a_name:     { at: 'fund3a', edge: 'Name', field: 'text', value: 'Calder Ridge Capital Partners III-A, L.P.' },
  fund3a_formed:   { at: 'fund3a', edge: 'Formation Date', field: 'date', value: '2024-09-16' },
  fund3a_ein:      { at: 'fund3a', edge: 'EIN', field: 'text', value: '93-2216840' },
  fund3a_fye:      { at: 'fund3a', edge: 'Fiscal Year End', field: 'text', value: 'December 31' },
  fund3a_target:   { at: 'fund3a', edge: 'Target Commitments', field: 'money', value: 150000000 },
  fund3a_good:     { at: 'fund3a', edge: 'Good Standing', tag: true },
  fund3a_erisa:    { at: 'fund3a', edge: 'ERISA Plan Assets', tag: false },
  fund3a_vehicle:  { at: 'fund3a', edge: 'Vehicle Type', choice: 'Parallel Fund' },
  fund3a_juris:    { at: 'fund3a', edge: 'Jurisdiction', choice: 'Delaware' },
  fund3a_file:     { at: 'fund3a_juris', edge: 'File Number', field: 'text', value: '7718452' },
  fund3a_juris_tax: { at: 'fund3a_juris', edge: 'Annual Tax Paid', field: 'date', value: '2026-05-27' },
  fund3a_type:     { at: 'fund3a', edge: 'Entity Type', choice: 'Limited Partnership' },
  // Its only recorded owner is an investor group, so the Tax Classification formula would call it a
  // disregarded entity; a partnership it is, entered (see docs/sample.md).
  fund3a_tax:      { at: 'fund3a_type', edge: 'Tax Classification', choice: 'Partnership' },
  fund3a_ics:      { at: 'fund3a', edge: 'Investment Company Status', choice: '3(c)(7) Fund' },
  fund3a_lei:      { at: 'fund3a', edge: 'LEI Registered', tag: true },
  fund3a_lei_code: { at: 'fund3a_lei', edge: 'LEI', field: 'text', value: '5493007CRCP3AFND0067' },
  fund3a_lei_on:   { at: 'fund3a_lei', edge: 'Registered On', field: 'date', value: '2024-10-02' },
  fund3a_lei_renewed: { at: 'fund3a_lei', edge: 'Last Renewed', field: 'date', value: '2025-09-24' },
  fund3a_cftc:     { at: 'fund3a', edge: '4.13(a)(3) Exemption', tag: true },
  fund3a_cftc_on:  { at: 'fund3a_cftc', edge: 'Claimed On', field: 'date', value: '2024-11-12' },
  fund3a_cftc_last: { at: 'fund3a_cftc', edge: 'Last Affirmed', field: 'date', value: '2026-02-27' },
  fund3a_regd:     { at: 'fund3a', edge: 'Regulation D Offering', tag: true },
  fund3a_regd_file: { at: 'fund3a_regd', edge: 'File Number', field: 'text', value: '021-512340' },
  fund3a_regd_sale: { at: 'fund3a_regd', edge: 'First Sale', field: 'date', value: '2024-11-15' },
  fund3a_regd_filed: { at: 'fund3a_regd', edge: 'Last Filed', field: 'date', value: '2024-11-26' },
  fund3a_regd_open: { at: 'fund3a_regd', edge: 'Offering Open', tag: false },
  gp_of_3a:        { args: [{ edge: 'GP', at: 'gp' }, { edge: 'Fund Owned', at: 'fund3a_type' }], tag: true },
  gp_of_3a_admitted: { at: 'gp_of_3a', edge: 'Admission Date', field: 'date', value: '2024-09-16' },
  adv_3a:          { args: [{ edge: 'Adviser', at: 'mgmt' }, { edge: 'Client', at: 'fund3a' }], tag: true },
  sign_chen_3a:    { args: [{ edge: 'Signatory', at: 'chen' }, { edge: 'Via', at: 'gp' }, { edge: 'On Behalf Of', at: 'fund3a' }], tag: true },
  sign_okfr_3a:    { args: [{ edge: 'Signatory', at: 'okafor' }, { edge: 'Via', at: 'gp' }, { edge: 'On Behalf Of', at: 'fund3a' }], tag: true },
  inv_3a:          { kind: 'Investor Group' },
  inv_3a_name:     { at: 'inv_3a', edge: 'Name', field: 'text', value: 'Fund III-A Investors (U.S. ERISA Plans)' },
  ...ownership('own_inv3a_3a', 'inv_3a', 'fund3a', 1),

  // AIV-1, an alternative investment vehicle for the Tessellate investment, held through its own blocker.
  aiv:             { kind: 'Entity' },
  aiv_name:        { at: 'aiv', edge: 'Name', field: 'text', value: 'Calder Ridge Capital Partners III AIV-1, L.P.' },
  aiv_formed:      { at: 'aiv', edge: 'Formation Date', field: 'date', value: '2025-02-11' },
  aiv_ein:         { at: 'aiv', edge: 'EIN', field: 'text', value: '93-3390125' },
  aiv_fye:         { at: 'aiv', edge: 'Fiscal Year End', field: 'text', value: 'December 31' },
  // Out of good standing since its first Delaware annual tax went unpaid (see its Annual Tax Due).
  aiv_good:        { at: 'aiv', edge: 'Good Standing', tag: false },
  aiv_vehicle:     { at: 'aiv', edge: 'Vehicle Type', choice: 'AIV' },
  aiv_juris:       { at: 'aiv', edge: 'Jurisdiction', choice: 'Delaware' },
  aiv_file:        { at: 'aiv_juris', edge: 'File Number', field: 'text', value: '7901336' },
  aiv_type:        { at: 'aiv', edge: 'Entity Type', choice: 'Limited Partnership' },
  aiv_tax:         { at: 'aiv_type', edge: 'Tax Classification', choice: 'Partnership' },
  aiv_ics:         { at: 'aiv', edge: 'Investment Company Status', choice: '3(c)(7) Fund' },
  gp_of_aiv:       { args: [{ edge: 'GP', at: 'gp' }, { edge: 'Fund Owned', at: 'aiv_type' }], tag: true },
  gp_of_aiv_admitted: { at: 'gp_of_aiv', edge: 'Admission Date', field: 'date', value: '2025-02-11' },
  adv_aiv:         { args: [{ edge: 'Adviser', at: 'mgmt' }, { edge: 'Client', at: 'aiv' }], tag: true },
  sign_chen_aiv:   { args: [{ edge: 'Signatory', at: 'chen' }, { edge: 'Via', at: 'gp' }, { edge: 'On Behalf Of', at: 'aiv' }], tag: true },
  sign_okfr_aiv:   { args: [{ edge: 'Signatory', at: 'okafor' }, { edge: 'Via', at: 'gp' }, { edge: 'On Behalf Of', at: 'aiv' }], tag: true },
  inv_aiv:         { kind: 'Investor Group' },
  inv_aiv_name:    { at: 'inv_aiv', edge: 'Name', field: 'text', value: 'AIV-1 Investors (Fund III and III-A Partners)' },
  ...ownership('own_invaiv_aiv', 'inv_aiv', 'aiv', 1),

  aivblk:          { kind: 'Entity' },
  aivblk_name:     { at: 'aivblk', edge: 'Name', field: 'text', value: 'Calder Ridge III AIV-1 Blocker, Inc.' },
  aivblk_formed:   { at: 'aivblk', edge: 'Formation Date', field: 'date', value: '2025-02-12' },
  aivblk_ein:      { at: 'aivblk', edge: 'EIN', field: 'text', value: '93-3390187' },
  aivblk_fye:      { at: 'aivblk', edge: 'Fiscal Year End', field: 'text', value: 'December 31' },
  aivblk_good:     { at: 'aivblk', edge: 'Good Standing', tag: true },
  aivblk_vehicle:  { at: 'aivblk', edge: 'Vehicle Type', choice: 'Blocker' },
  aivblk_juris:    { at: 'aivblk', edge: 'Jurisdiction', choice: 'Delaware' },
  aivblk_file:     { at: 'aivblk_juris', edge: 'File Number', field: 'text', value: '7901347' },
  aivblk_juris_frtax: { at: 'aivblk_juris', edge: 'Franchise Tax Paid', field: 'date', value: '2026-02-25' },
  aivblk_type:     { at: 'aivblk', edge: 'Entity Type', choice: 'Corporation' },
  aivblk_shares:   { at: 'aivblk_type', edge: 'Authorized Shares', field: 'number', value: 1000 },
  ...ownership('own_aiv_aivblk', 'aiv', 'aivblk', 1),
  ...position('pos_okfr_aivblk', 'okafor', 'aivblk', 'Director', 'Director and President', '2025-02-12'),
  ...position('pos_mor_aivblk', 'moretti', 'aivblk', 'Officer', 'Treasurer', '2025-02-12'),
  ...position('pos_fer_aivblk', 'ferraro', 'aivblk', 'Officer', 'Secretary', '2025-02-12'),

  tessellate:      { kind: 'Entity' },
  tessellate_name: { at: 'tessellate', edge: 'Name', field: 'text', value: 'Tessellate Dental Partners Holdco, LLC' },
  tessellate_formed: { at: 'tessellate', edge: 'Formation Date', field: 'date', value: '2025-02-20' },
  tessellate_vehicle: { at: 'tessellate', edge: 'Vehicle Type', choice: 'Portfolio Company' },
  tessellate_juris: { at: 'tessellate', edge: 'Jurisdiction', choice: 'Delaware' },
  tessellate_type: { at: 'tessellate', edge: 'Entity Type', choice: 'Limited Liability Company' },
  ...ownership('own_aivblk_tess', 'aivblk', 'tessellate', 0.66),
  ...position('pos_lind_tess', 'lindqvist', 'tessellate', 'Director', 'Manager (Board of Managers)', '2025-03-14'),

  // Corvane, held by Fund III and III-A, which the co-invest vehicle bought into in June 2026.
  corvane:         { kind: 'Entity' },
  corvane_name:    { at: 'corvane', edge: 'Name', field: 'text', value: 'Corvane Specialty Chemicals Holdings, LLC' },
  corvane_formed:  { at: 'corvane', edge: 'Formation Date', field: 'date', value: '2026-01-28' },
  corvane_vehicle: { at: 'corvane', edge: 'Vehicle Type', choice: 'Portfolio Company' },
  corvane_juris:   { at: 'corvane', edge: 'Jurisdiction', choice: 'Delaware' },
  corvane_type:    { at: 'corvane', edge: 'Entity Type', choice: 'Limited Liability Company' },
  ...ownership('own_fund_corvane', 'fund', 'corvane', 0.49),
  ...ownership('own_3a_corvane', 'fund3a', 'corvane', 0.07),
  ...ownership('own_coinv_corvane', 'coinv', 'corvane', 0.125),
  ...position('pos_okfr_corvane', 'okafor', 'corvane', 'Director', 'Manager (Board of Managers)', '2026-02-20'),

  coinv:           { kind: 'Entity' },
  coinv_name:      { at: 'coinv', edge: 'Name', field: 'text', value: 'Calder Ridge III Co-Invest (Corvane), L.P.' },
  coinv_formed:    { at: 'coinv', edge: 'Formation Date', field: 'date', value: '2026-05-20' },
  coinv_ein:       { at: 'coinv', edge: 'EIN', field: 'text', value: '93-4071552' },
  coinv_fye:       { at: 'coinv', edge: 'Fiscal Year End', field: 'text', value: 'December 31' },
  coinv_target:    { at: 'coinv', edge: 'Target Commitments', field: 'money', value: 60000000 },
  coinv_good:      { at: 'coinv', edge: 'Good Standing', tag: true },
  coinv_vehicle:   { at: 'coinv', edge: 'Vehicle Type', choice: 'Co-Investment Vehicle' },
  coinv_juris:     { at: 'coinv', edge: 'Jurisdiction', choice: 'Delaware' },
  coinv_file:      { at: 'coinv_juris', edge: 'File Number', field: 'text', value: '8124590' },
  coinv_type:      { at: 'coinv', edge: 'Entity Type', choice: 'Limited Partnership' },
  coinv_tax:       { at: 'coinv_type', edge: 'Tax Classification', choice: 'Partnership' },
  coinv_ics:       { at: 'coinv', edge: 'Investment Company Status', choice: '3(c)(7) Fund' },
  coinv_regd:      { at: 'coinv', edge: 'Regulation D Offering', tag: true },
  coinv_regd_file: { at: 'coinv_regd', edge: 'File Number', field: 'text', value: '021-561277' },
  coinv_regd_sale: { at: 'coinv_regd', edge: 'First Sale', field: 'date', value: '2026-06-15' },
  coinv_regd_filed: { at: 'coinv_regd', edge: 'Last Filed', field: 'date', value: '2026-06-26' },
  coinv_regd_open: { at: 'coinv_regd', edge: 'Offering Open', tag: true },
  gp_of_coinv:     { args: [{ edge: 'GP', at: 'gp' }, { edge: 'Fund Owned', at: 'coinv_type' }], tag: true },
  gp_of_coinv_admitted: { at: 'gp_of_coinv', edge: 'Admission Date', field: 'date', value: '2026-05-20' },
  adv_coinv:       { args: [{ edge: 'Adviser', at: 'mgmt' }, { edge: 'Client', at: 'coinv' }], tag: true },
  sign_chen_coinv: { args: [{ edge: 'Signatory', at: 'chen' }, { edge: 'Via', at: 'gp' }, { edge: 'On Behalf Of', at: 'coinv' }], tag: true },
  sign_okfr_coinv: { args: [{ edge: 'Signatory', at: 'okafor' }, { edge: 'Via', at: 'gp' }, { edge: 'On Behalf Of', at: 'coinv' }], tag: true },
  inv_coinv:       { kind: 'Investor Group' },
  inv_coinv_name:  { at: 'inv_coinv', edge: 'Name', field: 'text', value: 'Co-Invest Investors (Three Fund III Limited Partners)' },
  ...ownership('own_invco_coinv', 'inv_coinv', 'coinv', 1),

  // The legal and finance team, and the Cayman GP's independent director. Lindqvist was the manager's CCO
  // until Moretti took that on in January 2025 (see the history).
  ferraro:         { kind: 'Individual' },
  ferraro_name:    { at: 'ferraro', edge: 'Name', field: 'text', value: 'Jonathan S. Ferraro' },
  ferraro_email:   { at: 'ferraro', edge: 'Email', field: 'text', value: 'jferraro@example.com' },
  ferraro_us:      { at: 'ferraro', edge: 'U.S. Person', tag: true },
  ...position('pos_fer_mgmt', 'ferraro', 'mgmt', 'Officer', 'General Counsel and Secretary', '2020-09-14'),
  ...position('pos_fer_gp', 'ferraro', 'gp', 'Officer', 'Vice President and Secretary', '2023-02-10'),
  ...position('pos_fer_blocker', 'ferraro', 'blocker', 'Officer', 'Secretary', '2023-05-22'),
  sign_fer_mgmt:   { args: [{ edge: 'Signatory', at: 'ferraro' }, { edge: 'Via', at: 'mgmt' }, { edge: 'On Behalf Of', at: 'mgmt' }], tag: true },

  moretti:         { kind: 'Individual' },
  moretti_name:    { at: 'moretti', edge: 'Name', field: 'text', value: 'Rebecca A. Moretti' },
  moretti_email:   { at: 'moretti', edge: 'Email', field: 'text', value: 'rmoretti@example.com' },
  moretti_us:      { at: 'moretti', edge: 'U.S. Person', tag: true },
  ...position('pos_mor_mgmt', 'moretti', 'mgmt', 'Officer', 'Chief Financial Officer and Chief Compliance Officer', '2019-06-03'),
  ...position('pos_mor_gp', 'moretti', 'gp', 'Officer', 'Treasurer', '2023-02-10'),
  ...position('pos_mor_fdr', 'moretti', 'feeder', 'Officer', 'AML Compliance Officer', '2024-04-05'),
  // She signs for the fund, through GP III, up to a limit.
  sign_mor_fund:   { args: [{ edge: 'Signatory', at: 'moretti' }, { edge: 'Via', at: 'gp' }, { edge: 'On Behalf Of', at: 'fund' }], tag: true },
  sign_mor_fund_limit: { at: 'sign_mor_fund', edge: 'Limit', field: 'money', value: 5000000 },

  lindqvist:       { kind: 'Individual' },
  lindqvist_name:  { at: 'lindqvist', edge: 'Name', field: 'text', value: 'Thomas K. Lindqvist' },
  lindqvist_email: { at: 'lindqvist', edge: 'Email', field: 'text', value: 'tlindqvist@example.com' },
  lindqvist_us:    { at: 'lindqvist', edge: 'U.S. Person', tag: true },
  ...position('pos_lind_mgmt', 'lindqvist', 'mgmt', 'Employee', 'Partner, Head of Credit', '2018-06-05'),

  macallister:     { kind: 'Individual' },
  macallister_name: { at: 'macallister', edge: 'Name', field: 'text', value: 'Fiona MacAllister' },
  macallister_email: { at: 'macallister', edge: 'Email', field: 'text', value: 'fmacallister@example.com' },
  macallister_us:  { at: 'macallister', edge: 'U.S. Person', tag: false },

  // Seats on portfolio company boards.
  ...position('pos_chen_npine', 'chen', 'northpine', 'Director', 'Director (Chair)', '2023-11-02'),
  ...position('pos_okfr_hlvd', 'okafor', 'halvard', 'Director', 'Director', '2024-03-11'),

  // Registered agents, as service providers, each related to the jurisdiction it acts for an entity in.
  wilmington:      { kind: 'Service Provider' },
  wilmington_name: { at: 'wilmington', edge: 'Name', field: 'text', value: 'Wilmington Harbor Agent Services, LLC' },
  wilmington_address: { at: 'wilmington', edge: 'Address', field: 'text', value: '100 Harbor Row, Suite 400, Wilmington, DE 19801' },
  sevenmile:       { kind: 'Service Provider' },
  sevenmile_name:  { at: 'sevenmile', edge: 'Name', field: 'text', value: 'Seven Mile Corporate Services Ltd.' },
  sevenmile_address: { at: 'sevenmile', edge: 'Address', field: 'text', value: 'PO Box 1200, George Town, Grand Cayman KY1-1102' },
  ...agentFor('ra_fund', 'wilmington', 'fund_juris'),
  ...agentFor('ra_gp', 'wilmington', 'gp_juris'),
  ...agentFor('ra_mgmt', 'wilmington', 'mgmt_juris'),
  ...agentFor('ra_blocker', 'wilmington', 'blocker_juris'),
  ...agentFor('ra_holdco', 'wilmington', 'holdco_juris'),
  ...agentFor('ra_3a', 'wilmington', 'fund3a_juris'),
  ...agentFor('ra_aiv', 'wilmington', 'aiv_juris'),
  ...agentFor('ra_aivblk', 'wilmington', 'aivblk_juris'),
  ...agentFor('ra_coinv', 'wilmington', 'coinv_juris'),
  ...agentFor('ra_feeder', 'sevenmile', 'feeder_juris'),
  ...agentFor('ra_caygp', 'sevenmile', 'caygp_juris'),

  // Documents, each a file in the demo library, and what each is about. Three files there aren't indexed
  // (an MFN election form, an investor presentation, and the resolutions appointing MacAllister), and some
  // documents a legal team would want aren't there at all (see docs/sample.md).
  ...indexed('doc_colp3', { name: 'Certificate of Limited Partnership, Fund III', type: 'Certificate of Formation', date: '2023-02-14', status: 'Filed',
    path: 'Calder Ridge Fund III/Governing Documents/Certificate of Limited Partnership - Calder Ridge Capital Partners III, L.P.pdf' }, ['fund']),
  ...indexed('doc_lpa3', { name: 'Amended and Restated Limited Partnership Agreement, Fund III', type: 'Limited Partnership Agreement', date: '2023-06-30', status: 'Executed', version: 'A&R 2023',
    path: 'Calder Ridge Fund III/Governing Documents/Amended and Restated Limited Partnership Agreement - Calder Ridge Capital Partners III, L.P.pdf' }, ['fund', 'gp']),
  ...indexed('doc_elpa', { name: 'Exempted Limited Partnership Agreement, Cayman Feeder', type: 'Limited Partnership Agreement', date: '2023-06-30', status: 'Superseded',
    path: 'Calder Ridge Fund III/Governing Documents/Exempted Limited Partnership Agreement - Calder Ridge Capital Partners III (Cayman), L.P.pdf' }, ['feeder', 'gp']),
  ...indexed('doc_elpa24', { name: 'Amended and Restated Exempted Limited Partnership Agreement, Cayman Feeder', type: 'Limited Partnership Agreement', date: '2024-07-01', status: 'Executed', version: 'A&R 2024',
    path: 'Calder Ridge Fund III/Governing Documents/Amended and Restated Exempted Limited Partnership Agreement - Calder Ridge Capital Partners III (Cayman), L.P.pdf' }, ['feeder', 'caygp']),
  ...indexed('doc_gp_llca', { name: 'Limited Liability Company Agreement, GP III', type: 'Operating Agreement', date: '2023-02-10', status: 'Executed',
    path: 'Calder Ridge Fund III/Governing Documents/Limited Liability Company Agreement - Calder Ridge Capital GP III, LLC.docx' }, ['gp']),
  ...indexed('doc_blk_coi', { name: 'Certificate of Incorporation, Blocker', type: 'Certificate of Formation', date: '2023-05-22', status: 'Filed',
    path: 'Calder Ridge Fund III/Governing Documents/Certificate of Incorporation - Calder Ridge III Blocker, Inc.pdf' }, ['blocker']),
  ...indexed('doc_gp_cof', { name: 'Certificate of Formation, GP III', type: 'Certificate of Formation', date: '2023-02-10', status: 'Filed',
    path: 'Calder Ridge Fund III/Governing Documents/Certificate of Formation - Calder Ridge Capital GP III, LLC.pdf' }, ['gp']),
  ...indexed('doc_blk_bylaws', { name: 'Bylaws, Blocker', type: 'Bylaws', date: '2023-05-22', status: 'Final',
    path: 'Calder Ridge Fund III/Governing Documents/Bylaws - Calder Ridge III Blocker, Inc.pdf' }, ['blocker']),
  ...indexed('doc_caygp_ma', { name: 'Memorandum and Articles of Association, Cayman GP', type: 'Memorandum and Articles', date: '2024-06-20', status: 'Filed',
    path: 'Calder Ridge Fund III/Governing Documents/Memorandum and Articles of Association - Calder Ridge Capital GP III (Cayman), Ltd.pdf' }, ['caygp']),
  ...indexed('doc_incumbency', { name: 'Incumbency Certificate, GP III', type: 'Incumbency Certificate', date: '2026-06-10', status: 'Executed',
    path: 'Calder Ridge Fund III/Governing Documents/Incumbency Certificate - Calder Ridge Capital GP III, LLC.pdf' }, ['gp', 'fund', 'fund3a', 'coinv']),
  ...indexed('doc_sl_us', { name: 'Side Letter, U.S. Investors Series A', type: 'Side Letter', date: '2023-07-12', status: 'Executed',
    path: 'Calder Ridge Fund III/Side Letters/Side Letter - U.S. Investors Series A.pdf' }, ['fund']),
  ...indexed('doc_sl_halcyon', { name: 'Side Letter, Halcyon University Endowment', type: 'Side Letter', date: '2023-09-01', status: 'Executed',
    path: 'Calder Ridge Fund III/Side Letters/Side Letter - Halcyon University Endowment.pdf' }, ['fund']),
  ...indexed('doc_formd3', { name: 'Form D, Fund III', type: 'Regulatory Filing', date: '2023-07-05', status: 'Filed',
    path: 'Calder Ridge Fund III/Regulatory/Form D - Calder Ridge Capital Partners III, L.P.pdf' }, ['fund']),
  ...indexed('doc_formd3_24', { name: 'Form D/A, Fund III', type: 'Regulatory Filing', date: '2024-06-28', status: 'Filed', version: 'Amendment 2024',
    path: 'Calder Ridge Fund III/Regulatory/Form D Amendment 2024 - Calder Ridge Capital Partners III, L.P.pdf' }, ['fund']),
  ...indexed('doc_cima', { name: 'CIMA Certificate of Registration, Cayman Feeder', type: 'Regulatory Filing', date: '2023-08-15', status: 'Filed',
    path: 'Calder Ridge Fund III/Regulatory/CIMA Registration - Calder Ridge Capital Partners III (Cayman), L.P.pdf' }, ['feeder']),
  ...indexed('doc_gp_notice', { name: 'Notice of Change of General Partner, Cayman Feeder', type: 'Regulatory Filing', date: '2024-07-09', status: 'Filed',
    path: 'Calder Ridge Fund III/Regulatory/Notice of Change of General Partner - Calder Ridge Capital Partners III (Cayman), L.P.pdf' }, ['feeder', 'caygp', 'gp']),
  ...indexed('doc_cftc26', { name: 'CFTC 4.13(a)(3) Affirmation, 2026', type: 'Regulatory Filing', date: '2026-02-27', status: 'Filed', version: '2026',
    path: 'Calder Ridge Fund III/Regulatory/CFTC 4.13(a)(3) Affirmation 2026 - Fund III Pools.pdf' }, ['fund', 'fund3a', 'feeder']),
  ...indexed('doc_consent_close', { name: 'GP Written Consent: Admission of Limited Partners (First Closing)', type: 'Consent', date: '2023-06-30', status: 'Executed',
    path: 'Calder Ridge Fund III/Board Consents/GP Written Consent - Admission of Limited Partners (First Closing).pdf' }, ['gp', 'fund']),
  ...indexed('doc_blk_res', { name: 'Blocker Board Resolutions: Halvard Acquisition', type: 'Resolution', date: '2024-03-11', status: 'Executed',
    path: 'Calder Ridge Fund III/Board Consents/Blocker Board Resolutions - Halvard Acquisition.docx' }, ['blocker', 'halvard']),
  ...indexed('doc_consent_np', { name: 'GP Written Consent: Northpine Investment', type: 'Consent', date: '2023-11-02', status: 'Executed',
    path: 'Calder Ridge Fund III/Board Consents/GP Written Consent - Northpine Investment.pdf' }, ['gp', 'fund', 'northpine']),
  ...indexed('doc_ein3', { name: 'IRS EIN Confirmation (CP 575), Fund III', type: 'Tax Document', date: '2023-02-21', status: 'Final',
    path: 'Calder Ridge Fund III/Tax/IRS EIN Confirmation (CP 575) - Calder Ridge Capital Partners III, L.P.pdf' }, ['fund']),
  ...indexed('doc_frtax25', { name: 'Delaware Franchise Tax Report 2025, Blocker', type: 'Tax Document', date: '2025-02-26', status: 'Filed', version: '2025',
    path: 'Calder Ridge Fund III/Tax/Delaware Franchise Tax Report 2025 - Calder Ridge III Blocker, Inc.pdf' }, ['blocker']),
  ...indexed('doc_frtax26', { name: 'Delaware Franchise Tax Report 2026, Blocker', type: 'Tax Document', date: '2026-02-24', status: 'Filed', version: '2026',
    path: 'Calder Ridge Fund III/Tax/Delaware Franchise Tax Report 2026 - Calder Ridge III Blocker, Inc.pdf' }, ['blocker']),
  ...indexed('doc_8832', { name: 'Entity Classification Election (Form 8832), Northpine', type: 'Tax Document', date: '2023-12-04', status: 'Filed',
    path: 'Calder Ridge Fund III/Tax/Entity Classification Election (Form 8832) - Northpine Software, LLC.pdf' }, ['northpine']),
  ...indexed('doc_w9', { name: 'Form W-9, Fund III', type: 'Tax Document', date: '2024-01-08', status: 'Final',
    path: 'Calder Ridge Fund III/Tax/Form W-9 - Calder Ridge Capital Partners III, L.P.pdf' }, ['fund']),
  ...indexed('doc_lpa3a', { name: 'Limited Partnership Agreement, Fund III-A', type: 'Limited Partnership Agreement', date: '2024-11-15', status: 'Executed',
    path: 'Calder Ridge Fund III-A/Governing Documents/Limited Partnership Agreement - Calder Ridge Capital Partners III-A, L.P.pdf' }, ['fund3a', 'gp']),
  ...indexed('doc_aiv_consent', { name: 'GP Written Consent: Formation of AIV-1 and AIV-1 Blocker', type: 'Consent', date: '2025-02-10', status: 'Executed',
    path: 'Calder Ridge Fund III AIV-1/Board Consents/GP Written Consent - Formation of AIV-1 and AIV-1 Blocker.pdf' }, ['gp', 'fund', 'fund3a', 'aiv', 'aivblk']),
  ...indexed('doc_tess_consent', { name: 'AIV-1 Blocker Written Consent: Tessellate Acquisition', type: 'Consent', date: '2025-03-14', status: 'Executed',
    path: 'Calder Ridge Fund III AIV-1/Board Consents/AIV-1 Blocker Written Consent - Tessellate Acquisition.pdf' }, ['aivblk', 'tessellate']),
  ...indexed('doc_aivblk_coi', { name: 'Certificate of Incorporation, AIV-1 Blocker', type: 'Certificate of Formation', date: '2025-02-12', status: 'Filed',
    path: 'Calder Ridge Fund III AIV-1/Governing Documents/Certificate of Incorporation - Calder Ridge III AIV-1 Blocker, Inc.pdf' }, ['aivblk']),
  ...indexed('doc_coinv_consent', { name: 'GP Written Consent: Corvane Co-Investment', type: 'Consent', date: '2026-06-12', status: 'Executed',
    path: 'Calder Ridge III Co-Invest/Board Consents/GP Written Consent - Corvane Co-Investment.pdf' }, ['gp', 'fund', 'fund3a', 'coinv', 'corvane']),
  ...indexed('doc_lpa_coinv', { name: 'Limited Partnership Agreement, Co-Invest (Corvane)', type: 'Limited Partnership Agreement', date: '2026-06-15', status: 'Executed',
    path: 'Calder Ridge III Co-Invest/Governing Documents/Limited Partnership Agreement - Calder Ridge III Co-Invest (Corvane), L.P.pdf' }, ['coinv', 'gp']),
  ...indexed('doc_formd_coinv', { name: 'Form D, Co-Invest (Corvane)', type: 'Regulatory Filing', date: '2026-06-26', status: 'Filed',
    path: 'Calder Ridge III Co-Invest/Regulatory/Form D - Calder Ridge III Co-Invest (Corvane), L.P.pdf' }, ['coinv']),
  ...indexed('doc_bdc_aoi', { name: 'Articles of Incorporation, BDC', type: 'Certificate of Formation', date: '2021-09-08', status: 'Filed',
    path: 'Calder Ridge Capital BDC/Governing Documents/Articles of Incorporation - Calder Ridge Capital BDC, Inc.pdf' }, ['bdc']),
  ...indexed('doc_bdc_bylaws', { name: 'Bylaws, BDC', type: 'Bylaws', date: '2021-09-08', status: 'Final',
    path: 'Calder Ridge Capital BDC/Governing Documents/Bylaws - Calder Ridge Capital BDC, Inc.pdf' }, ['bdc']),
  ...indexed('doc_bdc_iaa', { name: 'Investment Advisory Agreement, BDC', type: 'Advisory Agreement', date: '2022-01-31', status: 'Executed',
    path: 'Calder Ridge Capital BDC/Governing Documents/Investment Advisory Agreement - Calder Ridge Capital BDC, Inc.docx' }, ['bdc', 'mgmt']),
  ...indexed('doc_n54a', { name: 'Form N-54A: Election to Be Regulated as a BDC', type: 'Regulatory Filing', date: '2021-10-15', status: 'Filed',
    path: 'Calder Ridge Capital BDC/Regulatory/Form N-54A - Election to Be Regulated as a BDC.pdf' }, ['bdc']),
  ...indexed('doc_exorder', { name: 'Co-Investment Exemptive Order', type: 'Exemptive Relief', date: '2022-06-24', status: 'Final',
    path: 'Calder Ridge Capital BDC/Regulatory/Co-Investment Exemptive Order - Calder Ridge Capital.pdf' }, ['bdc', 'mgmt', 'fund']),
  ...indexed('doc_affil_q3', { name: 'Close and Remote Affiliate Analysis, Q3 2026', type: 'Compliance Analysis', date: '2026-09-30', status: 'Final',
    path: 'Calder Ridge Capital BDC/Regulatory/Close and Remote Affiliate Analysis - Q3 2026.xlsx' }, ['bdc']),
  ...indexed('doc_bdc_formd25', { name: 'Form D/A, BDC', type: 'Regulatory Filing', date: '2025-11-10', status: 'Filed', version: 'Amendment 2025',
    path: 'Calder Ridge Capital BDC/Regulatory/Form D Amendment 2025 - Calder Ridge Capital BDC, Inc.pdf' }, ['bdc']),
  ...indexed('doc_bdc_min', { name: 'Board Minutes, Q3 2026 Regular Meeting', type: 'Minutes', date: '2026-09-17', status: 'Draft',
    path: 'Calder Ridge Capital BDC/Board Consents/Board Minutes - Q3 2026 Regular Meeting.docx' }, ['bdc']),
  ...indexed('doc_mgmt_cof', { name: 'Certificate of Formation, Calder Ridge Capital Management', type: 'Certificate of Formation', date: '2018-06-05', status: 'Filed',
    path: 'Calder Ridge Capital Management/Governing Documents/Certificate of Formation - Calder Ridge Capital Management, LLC.pdf' }, ['mgmt']),
  ...indexed('doc_mgmt_llca', { name: 'Amended and Restated LLC Agreement, Calder Ridge Capital Management', type: 'Operating Agreement', date: '2021-01-01', status: 'Executed', version: 'A&R 2021',
    path: 'Calder Ridge Capital Management/Governing Documents/Amended and Restated Limited Liability Company Agreement - Calder Ridge Capital Management, LLC.pdf' }, ['mgmt']),
  ...indexed('doc_adv25', { name: 'Form ADV Part 2A, 2025', type: 'Regulatory Filing', date: '2025-03-27', status: 'Superseded', version: '2025',
    path: 'Calder Ridge Capital Management/Compliance/Form ADV Part 2A 2025 - Calder Ridge Capital Management, LLC.pdf' }, ['mgmt']),
  ...indexed('doc_adv26', { name: 'Form ADV Part 2A, 2026', type: 'Regulatory Filing', date: '2026-03-28', status: 'Filed', version: '2026',
    path: 'Calder Ridge Capital Management/Compliance/Form ADV Part 2A - Calder Ridge Capital Management, LLC.pdf' }, ['mgmt']),
  ...indexed('doc_pf26', { name: 'Form PF Annual Update, 2026', type: 'Regulatory Filing', date: '2026-04-24', status: 'Filed', version: '2026',
    path: 'Calder Ridge Capital Management/Compliance/Form PF Annual Update 2026 - Calder Ridge Capital Management, LLC.pdf' }, ['mgmt']),
  ...indexed('doc_coe', { name: 'Code of Ethics', type: 'Policy', date: '2025-12-15', status: 'Final', version: '2025',
    path: 'Calder Ridge Capital Management/Compliance/Code of Ethics - Calder Ridge Capital Management, LLC.pdf' }, ['mgmt']),
  // Indexed without its date, which is required: a gap for someone to fill.
  ...indexed('doc_okafor_email', { name: 'Officer Appointment Email, D. Okafor', type: 'Correspondence', status: 'Final',
    path: 'Calder Ridge Capital Management/Compliance/Officer Appointment Email - D. Okafor.msg' }, ['mgmt']),

  // What some documents are evidence of: the appointments they made.
  ...evidence('ev_okafor_mgmt', 'doc_okafor_email', 'pos_okfr_mgmt'),
  ...evidence('ev_ma_chen', 'doc_caygp_ma', 'pos_chen_caygp'),
  ...evidence('ev_inc_mor', 'doc_incumbency', 'pos_mor_gp'),
  ...evidence('ev_inc_fer', 'doc_incumbency', 'pos_fer_gp'),
};

// The records the history took out of the core: the feeder's general partner, and the signing authority
// that went through it, when the Cayman GP took over on 2024-07-01; and the registered agents written as
// text, when they became relations to a Service Provider on 2025-01-15.
const CORE_RETIRED = ['gp_of_feeder', 'sign_chen_fdr', 'fund_agent', 'gp_agent'];

// The fund complex as it stands now: the core, filled out, less what the history took out of it.
const SAMPLE = Object.fromEntries(Object.entries({ ...SAMPLE_CORE, ...SAMPLE_COMPLEX }).filter(([id]) => !CORE_RETIRED.includes(id)));

// ---- Deadlines ----
// Due dates worked out by formula from what's entered, by the rules of docs/domain-research.md §2: each from
// when its obligation was last met, or failing that from what started it (a formation, a registration).
// Meeting one, by entering the date it was met on, moves it on to the next. They're dates and nothing more:
// whether one is overdue is a question for the day it's asked on.
const DELAWARE = 'Entity › Jurisdiction: Delaware';
const CAYMAN = 'Entity › Jurisdiction: Cayman Islands';
const DEADLINE_DEFINITIONS = [
  // Delaware LPs and LLCs: the annual tax for a year is due June 1 of the next; $400 from tax year 2026.
  { id: 'def_annual_tax', name: 'Annual Tax Due', type: 'field', datatype: 'date', at: [DELAWARE],
    formula: '= IF([Entity Type] IN {"Limited Partnership", "Limited Liability Company"} AND [Vehicle Type] <> "Portfolio Company", DATE(YEAR(MAX([Annual Tax Paid], [Formation Date])) + 1, 6, 1), BLANK())' },
  { id: 'def_annual_tax_amount', name: 'Annual Tax Amount', type: 'field', datatype: 'money', at: [DELAWARE],
    formula: '= IF(ISBLANK([Annual Tax Due]), BLANK(), IF(YEAR([Annual Tax Due]) - 1 >= 2026, $400, $300))' },
  // Delaware corporations: the annual report and franchise tax are due March 1.
  { id: 'def_franchise_tax', name: 'Franchise Tax Due', type: 'field', datatype: 'date', at: [DELAWARE],
    formula: '= IF([Entity Type] = "Corporation" AND [Vehicle Type] <> "Portfolio Company", DATE(YEAR(MAX([Franchise Tax Paid], [Formation Date])) + 1, 3, 1), BLANK())' },
  // Cayman exempted companies and ELPs: the annual return is due in January.
  { id: 'def_annual_return', name: 'Annual Return Due', type: 'field', datatype: 'date', at: [CAYMAN],
    formula: '= IF([Vehicle Type] <> "Portfolio Company", DATE(YEAR(MAX([Annual Return Filed], [Formation Date])) + 1, 1, 31), BLANK())' },
  // Form ADV's annual amendment, 90 days after the fiscal year ends, and Form PF's annual update, 120. A
  // fiscal year end is text, so these read only the December 31 that every Calder Ridge entity has.
  { id: 'def_form_adv', name: 'Form ADV Due', type: 'field', datatype: 'date', at: ['Entity › Registered Investment Adviser'],
    formula: '= IF([Fiscal Year End] = "December 31", NEXTDATE(12, 31, [Last Filed]) + 90, BLANK())' },
  { id: 'def_form_pf', name: 'Form PF Due', type: 'field', datatype: 'date', at: ['Entity › Registered Investment Adviser › Form PF Filer'],
    formula: '= IF([Fiscal Year End] = "December 31", NEXTDATE(12, 31, [Last Filed]) + 120, BLANK())' },
  // CIMA's annual fee for a registered private fund, due January 15.
  { id: 'def_cima_fee', name: 'Annual Fee Due', type: 'field', datatype: 'date', at: ['Entity › CIMA Registered'],
    formula: '= DATE(YEAR(MAX([Last Paid], [Registered On])) + 1, 1, 15)' },
  // Form D's annual amendment, on the anniversary of the last filing, while the offering is open; one due
  // on a weekend is due the next working day (Rule 503).
  { id: 'def_form_d', name: 'Form D Due', type: 'field', datatype: 'date', at: ['Entity › Regulation D Offering'],
    formula: '= IF([Offering Open], LET(due, EDATE([Last Filed], 12), WORKDAY(due - 1, 1)), BLANK())' },
  // The CFTC 4.13(a)(3) exemption, affirmed within 60 days after each calendar year ends, or it lapses.
  { id: 'def_cftc', name: 'Affirmation Due', type: 'field', datatype: 'date', at: ['Entity › 4.13(a)(3) Exemption'],
    formula: '= LET(due, NEXTDATE(12, 31, MAX([Last Affirmed], [Claimed On])) + 60, WORKDAY(due - 1, 1))' },
  // An LEI is renewed a year after it was issued or last renewed, or it lapses.
  { id: 'def_lei', name: 'Next Renewal', type: 'field', datatype: 'date', at: ['Entity › LEI Registered'],
    formula: '= EDATE(MAX([Last Renewed], [Registered On]), 12)' },
];

// ---- Documents on file ----
// What a legal team keeps for each entity, by its type: the document that formed it, and the agreement or
// articles that govern it, current (not a draft, a form or superseded). Each is a tag worked out from the
// entity's Documents: attested where one of the type it wants is on file, and ruled out where none is,
// which is what's missing. Portfolio companies keep their own. Every such tag is named "… on File".
const ENTITY_TYPES = ['Limited Partnership', 'Exempted Limited Partnership', 'Limited Liability Company', 'Corporation', 'Exempted Company']
  .map(type => `Entity › Entity Type: ${type}`);
const CURRENT = '@.Status IN {"Executed", "Filed", "Final"}';
const ON_FILE_DEFINITIONS = [
  { id: 'def_formation_on_file', name: 'Formation Document on File', type: 'tag', at: ENTITY_TYPES,
    formula: `= IF([Vehicle Type] = "Portfolio Company", BLANK(), LET(wanted, IF(@ = "Exempted Company", "Memorandum and Articles", "Certificate of Formation"), ANY(Documents, @.[Document Type] = wanted AND ${CURRENT})))` },
  { id: 'def_governing_on_file', name: 'Governing Agreement on File', type: 'tag', at: ENTITY_TYPES,
    formula: `= IF([Vehicle Type] = "Portfolio Company", BLANK(), LET(wanted, IFS(@ IN {"Limited Partnership", "Exempted Limited Partnership"}, "Limited Partnership Agreement", @ = "Limited Liability Company", "Operating Agreement", @ = "Corporation", "Bylaws", @ = "Exempted Company", "Memorandum and Articles"), ANY(Documents, @.[Document Type] = wanted AND ${CURRENT})))` },
];

// ---- Required entries, and entry order ----
// What a legal team insists on, by an example of each: a Formation Date, Jurisdiction and Entity Type on
// every Entity; a Link, type, date and status on every Document; and a Title and Start Date on every
// position, whatever its option. A few are deliberately missing (see docs/sample.md).
const SAMPLE_REQUIRED = ['fund_formed', 'fund_juris', 'fund_type', 'doc_colp3_link', 'doc_colp3_type', 'doc_colp3_date', 'doc_colp3_status',
  'pos_chen_bdc_title', 'pos_chen_bdc_start', 'pos_okfr_bdc_title', 'pos_okfr_bdc_start', 'pos_lind_mgmt_title', 'pos_lind_mgmt_start'];

// How each kind lists its entries, in the panel and the Records tables: after the Name, the key facts in
// this order, then the rest by type. An Entity's role (its Vehicle Type) and what it is come first, then its
// identifiers and standing; a Document's link, the address, comes last.
const SAMPLE_ORDER = {
  'kind:entity': ['short name', 'vehicle type', 'entity type', 'jurisdiction', 'formation date', 'fiscal year end', 'ein', 'lei registered', 'good standing'],
  'kind:individual': ['email', 'u.s. person'],
  'kind:document': ['document type', 'document date', 'status', 'version', 'link'],
};

// ---- Views ----

// The core's styles, one for each form it styles. Ownership's lines carry no label of their own; the
// Percentage at each one labels it, and a ruled-out ownership isn't drawn.
function coreStyles(recs) {
  const f = id => formKeyOf(id, recs);
  const muted = { show: true, format: 'paren', size: 10.5, color: '#52525b' };
  return [
    { id: 'st_kind', form: 'object',
      map: { entity: KIND_PRESET, individual: { ...KIND_PRESET, shape: 'oval' }, 'investor group': { ...KIND_PRESET, fill: '#f4f4f5' } } },
    { id: 'st_name', form: f('fund_name'), map: { text: NAME_PRESET } },
    { id: 'st_entity_type', form: f('fund_type'), map: {
      'limited partnership': { shape: 'triangle' }, 'exempted limited partnership': { shape: 'triangle' },
      'limited liability company': { shape: 'rounded' }, corporation: { shape: 'rect' } } },
    { id: 'st_vehicle', form: f('fund_vehicle'), map: {
      'main fund': { fill: '#e8eefb' }, 'feeder fund': { fill: '#e8eefb' }, 'business development company': { fill: '#e8eefb' },
      'portfolio company': { fill: '#f4f4f5' } } },
    { id: 'st_jurisdiction', form: f('fund_juris'), map: { delaware: muted, 'cayman islands': muted, maryland: muted } },
    { id: 'st_good_standing', form: f('fund_good'), map: { false: { stroke: '#d63b3b', strokeWidth: 2, dash: 'dashed' } } },
    { id: 'st_ownership', form: f('own_fund_blkr'), map: { true: { show: true, format: 'none' }, false: { show: false } } },
    { id: 'st_percentage', form: f('own_fund_blkr_pct'), map: { percent: { show: true } } },
    { id: 'st_gp', form: f('gp_of_fund'), map: { true: { show: true, dash: 'dashed', format: 'label' } } },
    { id: 'st_member', form: f('mem_chen_gp'), map: { 'managing member': { show: false }, member: { show: false } } },
    { id: 'st_adviser', form: f('adv_bdc'), map: { true: { show: false, dash: 'dotted', format: 'label' } } },
    { id: 'st_position', form: f('pos_chen_bdc'), map: { director: { show: false }, officer: { show: false } } },
  ];
}

// The core's views: the structure chart, and a 40 Act view of the same records that hides ownership and the
// GP's lines, draws the BDC's close and remote affiliates, which formulas work out, and by its filter shows
// only the boxes in that analysis: the BDC and its close and remote affiliates. Their lines keep the
// computed look, told apart by weight and dash.
const FORTY_ACT_FILTER = '← [Investment Company] OR COUNT([Close Affiliate Of]) + COUNT([Remote Affiliate Of]) > 0';

function coreViews(recs, S, defs, structure = coreStyles(recs)) {
  const hidden = ['st_ownership', 'st_percentage', 'st_gp'];
  const hide = s => ({ ...s, map: Object.fromEntries(Object.entries(s.map).map(([k, v]) => [k, { ...v, show: false }])) });
  const formOfDef = id => formOfTree(specsWithParam(defs.find(d => d.id === id).scope[0], S)[0]);
  const fortyAct = [
    ...structure.map(s => hidden.includes(s.id) ? hide(s) : s),
    { id: 'st_close', form: formOfDef('def_close'), map: { true: { show: true, format: 'none', strokeWidth: 1.5 } } },
    { id: 'st_remote', form: formOfDef('def_remote'), map: { true: { show: true, format: 'none', dash: 'dotted' } } },
  ];
  return [{ id: 'view_main', name: 'Structure', styles: structure, hidden: ['gp_of_feeder'] },
    { id: 'view_40act', name: '40 Act', styles: fortyAct, filter: FORTY_ACT_FILTER }];
}

// The fund complex's styles: the core's, with the looks of its new roles and types, and no boxes for
// documents and service providers, which the panel lists rather than the chart.
function sampleStyles(recs) {
  const fund = { fill: '#e8eefb' };
  const more = {
    st_kind: { document: { ...KIND_PRESET, show: false }, 'service provider': { ...KIND_PRESET, show: false } },
    st_entity_type: { 'exempted company': { shape: 'rect' } },
    st_vehicle: { 'parallel fund': fund, aiv: fund, 'co-investment vehicle': fund },
    st_position: { employee: { show: false } },
  };
  return coreStyles(recs).map(s => more[s.id] ? { ...s, map: { ...s.map, ...more[s.id] } } : s);
}

// Two more views a legal team keeps. Fund III: the fund family alone, its investors, vehicles and holdings.
// Management and control: the people, and the sponsor's entities they own and hold positions in: the
// manager, the GPs, the holding company, and the BDC the manager advises.
const FUND_III_FILTER = '← KIND(@) = "Investor Group" OR [Vehicle Type] IN {"Main Fund", "Parallel Fund", "Feeder Fund", "AIV", "Co-Investment Vehicle", "General Partner", "Blocker", "Portfolio Company"}';
const CONTROL_FILTER = '← KIND(@) = "Individual" OR [Vehicle Type] IN {"Management Company", "General Partner", "Holding Company", "Business Development Company"}';

function sampleViews(recs, S, defs) {
  const structure = sampleStyles(recs);
  const [main, fortyAct] = coreViews(recs, S, defs, structure);
  const shown = (s, look) => ({ ...s, map: Object.fromEntries(Object.entries(s.map).map(([k, v]) => [k, { ...v, show: true, ...look }])) });
  // Positions are labeled with their category; the adviser's line keeps its dots and label.
  const control = structure.map(s => s.id === 'st_position' ? shown(s, { format: 'value' }) : s.id === 'st_adviser' ? shown(s, {}) : s);
  const at = layout => structuredClone(layout);
  return [
    // The Structure view leaves out the people who hold nothing; the Management and control view has them.
    { ...main, hidden: ['raman', 'ferraro', 'moretti', 'lindqvist', 'macallister'], layout: at(SAMPLE_LAYOUT) },
    { ...fortyAct, layout: at(FORTY_ACT_LAYOUT) },
    { id: 'view_fund3', name: 'Fund III', styles: structuredClone(structure), filter: FUND_III_FILTER, layout: at(SAMPLE_LAYOUT) },
    { id: 'view_control', name: 'Management and control', styles: control, filter: CONTROL_FILTER, layout: at(CONTROL_LAYOUT) },
  ];
}

// Where the fund complex's boxes sit: investors along the top, with the principals among them; the funds
// below, GP III and the manager between Fund III and the feeder, so the GP's lines reach only its own
// funds; the holding company and the Cayman GP beyond the feeder; then what the funds hold. The BDC is to
// the far right, as in the core. The people the Structure view leaves out sit to the far right too.
const SAMPLE_LAYOUT = {
  inv_aiv:     { x: 40, y: 40, w: 200 },
  inv_coinv:   { x: 300, y: 40, w: 200 },
  inv_3a:      { x: 560, y: 40, w: 200 },
  inv_us:      { x: 820, y: 40, w: 200 },
  chen:        { x: 1090, y: 40, w: 170 },
  okafor:      { x: 1310, y: 40, w: 170 },
  inv_nonus:   { x: 1560, y: 40, w: 200 },
  pension:     { x: 2130, y: 40, w: 220 },
  gp:          { x: 1070, y: 196, w: 210 },
  mgmt:        { x: 1300, y: 196, w: 210 },
  holdco:      { x: 1830, y: 196, w: 210 },
  aiv:         { x: 25, y: 290, w: 230 },
  coinv:       { x: 285, y: 290, w: 230 },
  fund3a:      { x: 545, y: 290, w: 230 },
  fund:        { x: 805, y: 290, w: 230 },
  feeder:      { x: 1545, y: 290, w: 230 },
  caygp:       { x: 1830, y: 340, w: 210 },
  aivblk:      { x: 40, y: 520, w: 200 },
  corvane:     { x: 430, y: 520, w: 200 },
  blocker:     { x: 720, y: 520, w: 200 },
  northpine:   { x: 980, y: 520, w: 200 },
  bdc:         { x: 2130, y: 520, w: 220 },
  tessellate:  { x: 40, y: 650, w: 200 },
  halvard:     { x: 720, y: 650, w: 200 },
  raman:       { x: 2400, y: 40, w: 170 },
  ferraro:     { x: 2400, y: 130, w: 170 },
  moretti:     { x: 2400, y: 220, w: 170 },
  lindqvist:   { x: 2400, y: 310, w: 170 },
  macallister: { x: 2400, y: 400, w: 170 },
};

// The 40 Act view's own layout, around the BDC: the persons the formulas find to be its close and remote
// affiliates in a row above it and a row below, eleven to a row, 205 apart, and the BDC as wide as twelve
// of those steps, so that each line arrives right below or above where it starts and runs straight.
const FORTY_ACT_LAYOUT = {
  feeder:      { x: 150, y: 40, w: 190 },
  fund:        { x: 355, y: 40, w: 190 },
  fund3a:      { x: 560, y: 40, w: 190 },
  coinv:       { x: 765, y: 40, w: 190 },
  aiv:         { x: 970, y: 40, w: 190 },
  blocker:     { x: 1175, y: 40, w: 190 },
  northpine:   { x: 1380, y: 40, w: 190 },
  halvard:     { x: 1585, y: 40, w: 190 },
  corvane:     { x: 1790, y: 40, w: 190 },
  aivblk:      { x: 1995, y: 40, w: 190 },
  tessellate:  { x: 2200, y: 40, w: 190 },
  bdc:         { x: 40, y: 300, w: 2460 },
  pension:     { x: 150, y: 450, w: 190 },
  raman:       { x: 355, y: 450, w: 190 },
  chen:        { x: 560, y: 450, w: 190 },
  okafor:      { x: 765, y: 450, w: 190 },
  lindqvist:   { x: 970, y: 450, w: 190 },
  ferraro:     { x: 1175, y: 450, w: 190 },
  moretti:     { x: 1380, y: 450, w: 190 },
  holdco:      { x: 1585, y: 450, w: 190 },
  mgmt:        { x: 1790, y: 450, w: 190 },
  gp:          { x: 1995, y: 450, w: 190 },
  caygp:       { x: 2200, y: 450, w: 190 },
};

// The Management and control view's own layout: the people along the top, each above where they serve,
// and below them the sponsor's entities, those that own or advise one another side by side.
const CONTROL_LAYOUT = {
  macallister: { x: 40, y: 40, w: 170 },
  chen:        { x: 240, y: 40, w: 170 },
  raman:       { x: 440, y: 40, w: 170 },
  okafor:      { x: 640, y: 40, w: 170 },
  lindqvist:   { x: 840, y: 40, w: 170 },
  ferraro:     { x: 1040, y: 40, w: 170 },
  moretti:     { x: 1240, y: 40, w: 170 },
  caygp:       { x: 40, y: 280, w: 210 },
  holdco:      { x: 310, y: 280, w: 210 },
  bdc:         { x: 580, y: 280, w: 210 },
  mgmt:        { x: 930, y: 280, w: 210 },
  gp:          { x: 1200, y: 280, w: 210 },
};

// ---- History ----
// The sample's past, from mid-2024 on: what each edit did, when, and who made it. A step names what it
// changed: `adds` the records it added, each with whatever depends on it, as the sample has them now, less
// what later steps added; `was` the records it changed or deleted, as they were before it; `defines` the
// definitions it added. Entries are worked out from the steps by the model's own functions (sampleHistory).
const JORDAN = 'Jordan Alvarez', FERRARO = 'Jonathan S. Ferraro', MORETTI = 'Rebecca A. Moretti';

// A date entered again each time an obligation is met, from its value before the history begins (null if
// a step added it) through each later one to the one it has now: the steps that changed it.
function renewals(id, dates, who, time) {
  const all = [...dates, SAMPLE[id].value];
  return all.slice(1).map((date, i) => ({ when: `${date}T${time}`, who,
    ...(all[i] ? { was: { [id]: { ...SAMPLE[id], value: all[i] } } } : { adds: [id] }) }));
}

const SAMPLE_HISTORY = [
  // 2024: the Cayman GP takes over the feeder, and Fund III-A is formed.
  { when: '2024-06-20T14:12', who: JORDAN, adds: ['caygp'] },
  { when: '2024-06-20T14:20', who: JORDAN, adds: ['own_holdco_caygp'] },
  { when: '2024-06-20T15:02', who: FERRARO, adds: ['pos_chen_caygp'] },
  { when: '2024-06-20T15:04', who: FERRARO, adds: ['pos_lind_caygp'] },
  { when: '2024-06-24T16:30', who: JORDAN, adds: ['doc_caygp_ma'] },
  { when: '2024-06-28T19:05', who: JORDAN, adds: ['doc_formd3_24'] },
  { when: '2024-07-01T14:30', who: FERRARO, adds: ['gp_cay_fdr'] },
  { when: '2024-07-01T14:32', who: FERRARO, was: { gp_of_feeder: SAMPLE_CORE.gp_of_feeder } },
  { when: '2024-07-01T14:40', who: FERRARO, was: { sign_chen_fdr: SAMPLE_CORE.sign_chen_fdr } },
  { when: '2024-07-01T14:41', who: FERRARO, adds: ['sign_chen_fdr_cay'] },
  { when: '2024-07-09T15:15', who: JORDAN, adds: ['doc_gp_notice'] },
  { when: '2024-07-09T15:22', who: JORDAN, adds: ['doc_elpa24'] },
  { when: '2024-07-09T15:23', who: JORDAN, was: { doc_elpa_status: { ...SAMPLE.doc_elpa_status, choice: 'Executed' } } },
  { when: '2024-09-16T13:45', who: JORDAN, adds: ['fund3a'] },
  { when: '2024-10-02T14:05', who: JORDAN, adds: ['fund3a_lei'] },
  { when: '2024-11-12T15:30', who: MORETTI, adds: ['fund3a_cftc'] },
  { when: '2024-11-15T16:00', who: JORDAN, adds: ['inv_3a'] },
  { when: '2024-11-15T16:20', who: FERRARO, adds: ['doc_lpa3a'] },
  { when: '2024-11-26T15:10', who: JORDAN, adds: ['fund3a_regd'] },
  // 2025: Moretti takes over as CCO, the registered agents change, AIV-1 and its blocker are formed for
  // Tessellate, and MacAllister replaces Lindqvist on the Cayman GP's board.
  { when: '2025-01-02T14:15', who: FERRARO, was: { pos_lind_mgmt: { ...SAMPLE.pos_lind_mgmt, choice: 'Officer' } } },
  { when: '2025-01-02T14:16', who: FERRARO, was: { pos_lind_mgmt_title: { ...SAMPLE.pos_lind_mgmt_title, value: 'Chief Compliance Officer' } } },
  { when: '2025-01-02T14:18', who: FERRARO, was: { pos_mor_mgmt_title: { ...SAMPLE.pos_mor_mgmt_title, value: 'Chief Financial Officer' } } },
  { when: '2025-01-15T15:00', who: JORDAN, adds: ['wilmington'] },
  { when: '2025-01-15T15:06', who: JORDAN, was: { fund_agent: SAMPLE_CORE.fund_agent } },
  { when: '2025-01-15T15:07', who: JORDAN, adds: ['ra_fund'] },
  { when: '2025-01-15T15:09', who: JORDAN, was: { gp_agent: SAMPLE_CORE.gp_agent } },
  { when: '2025-01-15T15:10', who: JORDAN, adds: ['ra_gp'] },
  { when: '2025-01-15T15:12', who: JORDAN, adds: ['ra_mgmt'] },
  { when: '2025-01-15T15:13', who: JORDAN, adds: ['ra_blocker'] },
  { when: '2025-01-15T15:15', who: JORDAN, adds: ['ra_holdco'] },
  { when: '2025-01-15T15:16', who: JORDAN, adds: ['ra_3a'] },
  { when: '2025-02-11T15:40', who: JORDAN, adds: ['aiv'] },
  { when: '2025-02-12T16:10', who: JORDAN, adds: ['aivblk'] },
  { when: '2025-02-13T14:30', who: FERRARO, adds: ['doc_aiv_consent'] },
  { when: '2025-02-13T14:35', who: JORDAN, adds: ['doc_aivblk_coi'] },
  { when: '2025-02-26T15:20', who: JORDAN, adds: ['doc_frtax25'] },
  { when: '2025-03-14T17:00', who: JORDAN, adds: ['inv_aiv'] },
  { when: '2025-03-14T17:10', who: JORDAN, adds: ['tessellate'] },
  { when: '2025-03-14T17:25', who: FERRARO, adds: ['doc_tess_consent'] },
  { when: '2025-03-27T18:40', who: MORETTI, adds: ['doc_adv25'] },
  { when: '2025-03-31T20:00', who: JORDAN, was: { fund_regd_open: { ...SAMPLE.fund_regd_open, tag: true } } },
  { when: '2025-03-31T20:02', who: JORDAN, was: { feeder_regd_open: { ...SAMPLE.feeder_regd_open, tag: true } } },
  { when: '2025-03-31T20:04', who: JORDAN, was: { fund3a_regd_open: { ...SAMPLE.fund3a_regd_open, tag: true } } },
  { when: '2025-06-30T19:30', who: FERRARO, was: position('pos_lind_caygp', 'lindqvist', 'caygp', 'Director', 'Director', '2024-06-20') },
  { when: '2025-07-01T14:45', who: JORDAN, adds: ['macallister'] },
  { when: '2025-11-10T16:15', who: JORDAN, adds: ['doc_bdc_formd25'] },
  { when: '2025-12-15T15:30', who: FERRARO, adds: ['doc_coe'] },
  // 2026: Corvane is bought, and the co-invest vehicle buys into it, diluting the funds; AIV-1 falls out of
  // good standing; Delaware's new tax gets a formula.
  { when: '2026-02-20T15:00', who: JORDAN, adds: ['corvane'] },
  { when: '2026-02-24T15:20', who: JORDAN, adds: ['doc_frtax26'] },
  { when: '2026-02-27T19:10', who: MORETTI, adds: ['doc_cftc26'] },
  { when: '2026-03-28T18:40', who: MORETTI, adds: ['doc_adv26'] },
  { when: '2026-03-28T18:42', who: MORETTI, was: { doc_adv25_status: { ...SAMPLE.doc_adv25_status, choice: 'Filed' } } },
  { when: '2026-04-24T18:00', who: MORETTI, adds: ['doc_pf26'] },
  { when: '2026-05-20T14:30', who: JORDAN, adds: ['coinv'] },
  { when: '2026-06-03T15:45', who: FERRARO, defines: ['def_annual_tax_amount'] },
  { when: '2026-06-10T16:00', who: FERRARO, adds: ['doc_incumbency'] },
  { when: '2026-06-12T18:30', who: FERRARO, adds: ['doc_coinv_consent'] },
  { when: '2026-06-15T15:00', who: JORDAN, adds: ['inv_coinv'] },
  { when: '2026-06-15T15:05', who: JORDAN, was: { own_fund_corvane_pct: { ...SAMPLE.own_fund_corvane_pct, value: 0.56 } } },
  { when: '2026-06-15T15:06', who: JORDAN, was: { own_3a_corvane_pct: { ...SAMPLE.own_3a_corvane_pct, value: 0.08 } } },
  { when: '2026-06-15T15:08', who: JORDAN, adds: ['own_coinv_corvane'] },
  { when: '2026-06-15T15:09', who: JORDAN, adds: ['own_coinv_corvane_pct'] },
  { when: '2026-06-15T16:40', who: FERRARO, adds: ['doc_lpa_coinv'] },
  { when: '2026-06-26T17:30', who: JORDAN, adds: ['coinv_regd'] },
  { when: '2026-06-26T17:35', who: JORDAN, adds: ['doc_formd_coinv'] },
  { when: '2026-07-15T14:20', who: JORDAN, was: { aiv_good: { ...SAMPLE.aiv_good, tag: true } } },
  { when: '2026-09-18T15:00', who: FERRARO, adds: ['doc_bdc_min'] },
  { when: '2026-10-02T16:45', who: MORETTI, adds: ['doc_affil_q3'] },
  // Filings and payments, made again as each fell due, each moving its deadline on.
  ...renewals('fund_regd_filed', ['2023-07-05'], JORDAN, '19:00'),
  ...renewals('feeder_regd_filed', ['2023-07-05'], JORDAN, '19:02'),
  ...renewals('bdc_regd_filed', ['2023-11-13', '2024-11-12'], JORDAN, '16:10'),
  ...renewals('feeder_cima_paid', ['2024-01-11', '2025-01-13'], MORETTI, '16:00'),
  ...renewals('feeder_juris_return', ['2024-01-18', '2025-01-21'], JORDAN, '15:30'),
  ...renewals('caygp_juris_return', [null, '2025-01-21'], JORDAN, '15:35'),
  ...renewals('blocker_juris_frtax', ['2024-02-27', '2025-02-26'], JORDAN, '15:18'),
  { when: '2026-02-25T10:05', who: JORDAN, was: { blocker_good: SAMPLE_CORE.blocker_good } },
  ...renewals('aivblk_juris_frtax', [null], JORDAN, '15:25'),
  ...renewals('fund_cftc_last', ['2024-02-28', '2025-02-27'], MORETTI, '19:00'),
  ...renewals('feeder_cftc_last', ['2024-02-28', '2025-02-27'], MORETTI, '19:02'),
  ...renewals('fund3a_cftc_last', [null, '2025-02-27'], MORETTI, '19:04'),
  ...renewals('mgmt_lei_renewed', ['2024-03-10', '2025-03-10'], MORETTI, '15:05'),
  ...renewals('mgmt_ria_filed', ['2024-03-28', '2025-03-27'], MORETTI, '18:35'),
  ...renewals('feeder_lei_renewed', ['2024-04-02', '2025-04-02'], MORETTI, '15:10'),
  ...renewals('mgmt_pf_filed', ['2024-04-26', '2025-04-25'], MORETTI, '17:50'),
  ...renewals('fund_juris_tax', ['2024-05-29', '2025-05-28'], MORETTI, '14:10'),
  ...renewals('gp_juris_tax', ['2024-05-29', '2025-05-28'], MORETTI, '14:12'),
  ...renewals('mgmt_juris_tax', ['2024-05-29', '2025-05-28'], MORETTI, '14:14'),
  ...renewals('holdco_juris_tax', ['2024-05-29', '2025-05-28'], MORETTI, '14:16'),
  ...renewals('fund3a_juris_tax', [null, '2025-05-28'], MORETTI, '14:18'),
  ...renewals('fund3a_lei_renewed', [null], MORETTI, '15:15'),
  ...renewals('fund_lei_renewed', [null, '2024-11-14'], MORETTI, '15:00'),
];

// The history as the model keeps one (see "History" in model.js), newest first, worked out by walking back
// from the sample as it is now through the steps: each entry has exactly the entered records its step
// changed, before and after, and says so in the model's own words. Records a step deleted are in the
// archive, as deleting puts them there, and the schema keeps every specification the history's records had.
function sampleHistory(recs, defs, N, S) {
  const steps = [...SAMPLE_HISTORY].sort((a, b) => a.when.localeCompare(b.when));
  const history = [], archive = [];
  let after = recs, afterDefs = defs;
  for (let i = steps.length - 1; i >= 0; i--) {
    const { when, who, adds = [], was = {}, defines = [] } = steps[i];
    const before = { ...after };
    for (const id of withDependents(adds, after)) delete before[id];
    Object.assign(before, structuredClone(was));
    const beforeDefs = afterDefs.filter(d => !defines.includes(d.id));
    const changes = changesBetween(before, after);
    const summary = changeSummary(changes, before, after, definitionChanges(beforeDefs, afterDefs, S, N, S, N), N);
    const at = new Date(`${when}:00Z`);
    history.push({ id: samplePastId(i), when: at.toISOString(), who, summary, changes });
    const deleted = Object.keys(was).filter(id => !after[id]);
    if (deleted.length) archive.push({ id: `deleted_${i + 1}`, label: recordPhrase(before, deleted[0], N), when: at.getTime(),
      records: Object.fromEntries(deleted.map(id => [id, before[id]])) });
    const changed = changes.filter(c => c.before).map(c => c.id);
    S = withTrees(S, [...withDependents(changed, before)].map(id => treeOf(before, id)));
    after = before;
    afterDefs = beforeDefs;
  }
  return { history, archive, schema: S };
}

// The sample's past has ids of its own, the same each time it's worked out, so a chart reset to the sample
// doesn't take it in twice, and what's in a chart's history beyond it is what was done in the workbook.
const samplePastId = i => `hist_${String(i + 1).padStart(3, '0')}`;
const SAMPLE_PAST = new Set(SAMPLE_HISTORY.map((_, i) => samplePastId(i)));
const isSamplePast = entry => SAMPLE_PAST.has(entry.id);

// ---- The sample's states ----

// The sample's formulas and names in their stored form, with the schema of its records and what the
// formulas declare. The formula lab works from the core's.
const sampleFormulas = (recs = SAMPLE_CORE, defs = SAMPLE_DEFINITIONS) => canonicalFormulas(defs, SAMPLE_NAMES, withSpecsOf({}, recs));

// The core, as a chart's state: its records, its schema (theirs, and what its formulas declare), its
// formulas and names in their stored form, and its views. It requires a Formation Date on every Entity,
// which two portfolio companies lack.
function sampleCoreState() {
  const recs = structuredClone(SAMPLE_CORE);
  const { definitions: defs, names: nms, schema: S } = sampleFormulas(recs);
  return {
    schema: S, records: recs, order: {}, archive: [], definitions: defs, names: nms,
    views: coreViews(recs, S, defs).map(v => ({ ...v, layout: structuredClone(SAMPLE_CORE_LAYOUT) })),
    required: [parameterization(recs, 'fund_formed')],
  };
}

// The sample a chart starts from: the fund complex, with its deadlines, required entries, views and
// history, and what its history deleted.
function sampleState() {
  const recs = structuredClone(SAMPLE);
  const { definitions: defs, names: nms, schema: S0 } = sampleFormulas(recs, [...SAMPLE_DEFINITIONS, ...DEADLINE_DEFINITIONS, ...ON_FILE_DEFINITIONS]);
  const { history, archive, schema: S } = sampleHistory(recs, defs, nms, S0);
  return {
    schema: S, records: recs, order: structuredClone(SAMPLE_ORDER), archive, definitions: defs, names: nms,
    descriptions: sampleDescriptions(defs, S),
    views: sampleViews(recs, S, defs), required: SAMPLE_REQUIRED.map(id => parameterization(recs, id)), history,
  };
}

// What the sample's computed forms mean, in a lawyer's words, by the definition that computes each: the
// first thing a computed record's Why says, before its formula.
const SAMPLE_DESCRIPTIONS = {
  def_private_fund: 'A fund that would be an investment company but for section 3(c)(1) or 3(c)(7) of the Investment Company Act.',
  def_investment_company: 'An investment company under the Investment Company Act; here, a business development company.',
  def_adds_up: 'Whether the ownership recorded in the chart accounts for 100% of the entity. When it doesn’t, other owners aren’t charted.',
  def_tax: 'How the entity is taxed by default: a corporation as a C corporation; an entity with one owner (not an investor group) as disregarded; anything else as a partnership. An election entered by hand overrides it.',
  def_look_through: 'The share of an entity an investor holds through every chain of ownership, multiplying the percentages along each chain.',
  def_control: 'Control under section 2(a)(9) of the Investment Company Act: owning more than 25% of the voting securities, directly or through companies it controls, or being the entity’s general partner or managing member.',
  def_affiliated: 'An affiliated person under section 2(a)(3): a 5% owner of the other, a company 5% owned by it, one under common control with it, its officer, director, partner or employee, or for an investment company, its investment adviser.',
  def_close: 'A close affiliate of the BDC under Rule 57(b): its directors, officers, employees and investment adviser, those who control it, and their affiliates of the kinds the rule names. Transactions with them need an SEC order.',
  def_remote: 'A remote affiliate of the BDC under section 57(e): a 5% owner of it, or a company it controls, that isn’t a close affiliate. Transactions with them need the approval of the required majority of the BDC’s board.',
  def_3c1: 'How many beneficial owners section 3(c)(1) counts for a private fund: one per owner, looking through a fund that owns 10% or more.',
  def_annual_tax: 'When the Delaware annual tax for a limited partnership or LLC is next due: June 1, for the year before, unless already paid.',
  def_annual_tax_amount: 'The Delaware annual tax due: $300 through tax year 2025, $400 from tax year 2026 (HB 400).',
  def_franchise_tax: 'When the Delaware franchise tax and annual report for a corporation are next due: March 1, for the year before.',
  def_annual_return: 'When the Cayman annual return is next due: in January, before which there’s no penalty.',
  def_form_adv: 'When the Form ADV annual updating amendment is next due: within 90 days after the fiscal year end.',
  def_form_pf: 'When the annual Form PF update is next due: within 120 days after the fiscal year end.',
  def_cima_fee: 'When the CIMA annual fee for a registered private fund is next due: January 15.',
  def_form_d: 'When the Form D annual amendment is next due, while the offering is open: on the anniversary of the last filing, a weekend moving it to the next working day.',
  def_cftc: 'When the CFTC Rule 4.13(a)(3) exemption must next be affirmed: within 60 days after the year end.',
  def_lei: 'When the entity’s LEI must next be renewed: a year after its last renewal, or it lapses.',
  def_formation_on_file: 'Whether the entity’s certificate of formation (or incorporation, or registration) is linked and filed.',
  def_governing_on_file: 'Whether the entity’s executed governing agreement (LPA, LLC agreement or bylaws) is linked.',
};
function sampleDescriptions(defs, S) {
  return Object.fromEntries(defs.flatMap(d => {
    const t = SAMPLE_DESCRIPTIONS[d.id] && specsWithParam(d.scope[0], S)[0];
    return t ? [[formOfTree(t), SAMPLE_DESCRIPTIONS[d.id]]] : [];
  }));
}

const SAMPLE_CHART_NAME = 'Calder Ridge Fund III structure';
