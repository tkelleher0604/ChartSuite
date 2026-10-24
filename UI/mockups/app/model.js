// The state: records in the tree data model (see data-model.md), plus the presentation that goes with them
// (entry order, chart styles and box positions), with undo and redo over all of it.

// Sample state, path case only: every non-object record has exactly one location.
// `at` is the id of that location and `edge` labels the edge to it.
// The root is one of: an object (kind), a field (datatype + value), a choice (text) or a tag (Boolean).
// Labels, choices and kinds are matched without regard to case, but shown as written.
const SAMPLE = {
  fund:            { kind: 'Entity' },
  fund_name:       { at: 'fund', edge: 'Name', field: 'text', value: 'Calder Ridge Capital Partners III, L.P.' },
  fund_formed:     { at: 'fund', edge: 'Formation Date', field: 'date', value: '2023-02-14' },
  fund_ein:        { at: 'fund', edge: 'EIN', field: 'text', value: '92-4810337' },
  fund_fye:        { at: 'fund', edge: 'Fiscal Year End', field: 'text', value: 'December 31' },
  fund_target:     { at: 'fund', edge: 'Target Commitments', field: 'number', value: '$750,000,000' },
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
  blocker_shares:  { at: 'blocker_type', edge: 'Authorized Shares', field: 'number', value: '1,000' },
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
  own_us_fund_pct: { at: 'own_us_fund', edge: 'Percentage', field: 'number', value: '71.6%' },
  own_nonus_fdr:   { args: [{ edge: 'Owner', at: 'inv_nonus' }, { edge: 'Owned', at: 'feeder' }], tag: true },
  own_nonus_fdr_pct: { at: 'own_nonus_fdr', edge: 'Percentage', field: 'number', value: '100%' },
  own_fund_blkr:   { args: [{ edge: 'Owner', at: 'fund' }, { edge: 'Owned', at: 'blocker' }], tag: true },
  own_fund_blkr_pct: { at: 'own_fund_blkr', edge: 'Percentage', field: 'number', value: '100%' },
  own_fund_npine:  { args: [{ edge: 'Owner', at: 'fund' }, { edge: 'Owned', at: 'northpine' }], tag: true },
  own_fund_npine_pct: { at: 'own_fund_npine', edge: 'Percentage', field: 'number', value: '64%' },
  own_blkr_hlvd:   { args: [{ edge: 'Owner', at: 'blocker' }, { edge: 'Owned', at: 'halvard' }], tag: true },
  own_blkr_hlvd_pct: { at: 'own_blkr_hlvd', edge: 'Percentage', field: 'number', value: '82%' },
  own_fdr_fund:    { args: [{ edge: 'Owner', at: 'feeder' }, { edge: 'Owned', at: 'fund' }], tag: true },
  own_fdr_fund_pct: { at: 'own_fdr_fund', edge: 'Percentage', field: 'number', value: '28.4%' },
  own_chen_mgmt:   { args: [{ edge: 'Owner', at: 'chen' }, { edge: 'Owned', at: 'mgmt' }], tag: true },
  own_chen_mgmt_pct: { at: 'own_chen_mgmt', edge: 'Percentage', field: 'number', value: '60%' },
  own_okfr_mgmt:   { args: [{ edge: 'Owner', at: 'okafor' }, { edge: 'Owned', at: 'mgmt' }], tag: true },
  own_okfr_mgmt_pct: { at: 'own_okfr_mgmt', edge: 'Percentage', field: 'number', value: '40%' },
  own_chen_gp:     { args: [{ edge: 'Owner', at: 'chen' }, { edge: 'Owned', at: 'gp' }], tag: true },
  own_chen_gp_pct: { at: 'own_chen_gp', edge: 'Percentage', field: 'number', value: '50%' },
  own_okfr_gp:     { args: [{ edge: 'Owner', at: 'okafor' }, { edge: 'Owned', at: 'gp' }], tag: true },
  own_okfr_gp_pct: { at: 'own_okfr_gp', edge: 'Percentage', field: 'number', value: '50%' },
  own_bdc_npine:   { args: [{ edge: 'Owner', at: 'bdc' }, { edge: 'Owned', at: 'northpine' }], tag: true },
  own_bdc_npine_pct: { at: 'own_bdc_npine', edge: 'Percentage', field: 'number', value: '12%' },
  own_pens_bdc:    { args: [{ edge: 'Owner', at: 'pension' }, { edge: 'Owned', at: 'bdc' }], tag: true },
  own_pens_bdc_pct: { at: 'own_pens_bdc', edge: 'Percentage', field: 'number', value: '7%' },

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
const SAMPLE_LAYOUT = {
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
    formula: '= IFS(@ = "Corporation", "C Corporation", [Ownership Adds Up] AND COUNT(Owners) = 1, "Disregarded Entity", TRUE, "Partnership")' },
  { id: 'def_look_through', name: 'Look-Through Ownership', type: 'field', datatype: 'number', percent: true,
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

// The workbook is saved under WORKBOOK_KEY. A chart saved under STATE_KEY, before there were workbooks,
// becomes a workbook's only chart.
const WORKBOOK_KEY = 'rboreal.workbook.v1';
const STATE_KEY = 'rboreal.state.v8';
const SAMPLE_CHART_NAME = 'Calder Ridge Fund III structure';

// A chart's state is the records plus what goes with them:
// - entered: the records typed in. `records` is what everything reads: the entered records together with
//   those the chart's formulas compute (see formulas.md), worked out again after every change;
// - definitions: the formulas, and names: the names formulas use for relations and their lists;
// - order: the order entries are shown in, kept per location specification (see specKey), so that, say,
//   every Entity lists its entries in the same order, the way a spreadsheet's rows share its columns;
// - views: the chart's views, each with its own styles (see styles.js) and box positions. The records are
//   the same in every view. `styles` and `layout` are the current view's, written back into `views` on save;
// - required: the entries every location like theirs should have, by parameterization, each with its
//   label and type so a blank one can be shown and filled in;
// - archive: deleted records, kept in batches so each can be restored with its dependents.
// The order, styles and layout are presentation; the data model's trees are unordered and unstyled.
let entered, records, definitions, names, order, views, viewId, styles, layout, required, archive;
const undoStack = [];
const redoStack = [];

function setState(s) {
  ({ records: entered, definitions = [], names = { relations: [] }, order = {}, views = null, viewId = null, required = {}, archive = [] } = s);
  recompute();
  // A state saved before there were views has one set of styles and box positions.
  if (!views) views = [{ id: 'view_main', name: 'Structure', styles: s.styles ?? null, layout: s.layout ?? {} }];
  if (!views.some(v => v.id === viewId)) viewId = views[0].id;
  const view = views.find(v => v.id === viewId);
  styles = view.styles ?? defaultStyles(records);
  layout = view.layout ?? {};
}

// Called once every script has loaded, since sample styles come from styles.js.
function initState() {
  try {
    const saved = JSON.parse(localStorage.getItem(WORKBOOK_KEY));
    if (saved?.charts?.length) {
      workbook = { deleted: [], ...saved };
      if (!chartInUse()) workbook.chartId = workbook.charts[0].id;
      return setState(chartInUse().state);
    }
    const old = JSON.parse(localStorage.getItem(STATE_KEY));
    if (old?.records) {
      workbook = { charts: [{ id: 'chart_main', name: SAMPLE_CHART_NAME, state: old }], chartId: 'chart_main', deleted: [] };
      return setState(old);
    }
  } catch {}
  workbook = { charts: [{ id: 'chart_main', name: SAMPLE_CHART_NAME, state: sampleState() }], chartId: 'chart_main', deleted: [] };
  setState(chartInUse().state);
}

// The sample requires a Formation Date on every Entity, which two portfolio companies lack.
function sampleState() {
  const recs = structuredClone(SAMPLE);
  return {
    records: recs, order: {}, archive: [], definitions: structuredClone(SAMPLE_DEFINITIONS), names: structuredClone(SAMPLE_NAMES),
    views: sampleViews(recs).map(v => ({ ...v, layout: structuredClone(SAMPLE_LAYOUT) })),
    required: { [parameterization(recs, 'fund_formed')]: { label: 'Formation Date', type: 'field', datatype: 'date' } },
  };
}

// States are never mutated in place, so earlier ones can be kept for undo.
const currentViews = () => views.map(v => v.id === viewId ? { ...v, styles, layout } : v);
const snapshot = () => ({ records: entered, definitions, names, order, views: currentViews(), viewId, required, archive });

function saveState() {
  try { localStorage.setItem(WORKBOOK_KEY, JSON.stringify({ ...workbook, charts: currentCharts() })); } catch {}
}

function pushUndo() {
  undoStack.push(snapshot());
  redoStack.length = 0;
}
function undoState() {
  if (!undoStack.length) return false;
  redoStack.push(snapshot());
  setState(undoStack.pop());
  saveState();
  return true;
}
function redoState() {
  if (!redoStack.length) return false;
  undoStack.push(snapshot());
  setState(redoStack.pop());
  saveState();
  return true;
}
// Puts the sample back in the current chart, as one undoable step. Other charts are left alone.
function resetState() {
  pushUndo();
  setState(sampleState());
  saveState();
}

// ---- Workbooks ----
// A workbook holds charts, each with a state of its own, unsynced with the others. The current chart's
// state is the one held in the variables above; the others wait in `workbook.charts` as they were saved.
// Each chart keeps its own undo history while the page is open. Deleted charts are kept, to be restored.

let workbook = { charts: [], chartId: null, deleted: [] };
const undoByChart = new Map();

const chartInUse = () => workbook.charts.find(c => c.id === workbook.chartId);
const currentCharts = () => workbook.charts.map(c => c.id === workbook.chartId ? { ...c, state: snapshot() } : c);

// Sets the current chart's undo history aside, and brings back another's.
function swapHistory(toId) {
  undoByChart.set(workbook.chartId, { undo: undoStack.splice(0), redo: redoStack.splice(0) });
  const kept = undoByChart.get(toId);
  if (kept) { undoStack.push(...kept.undo); redoStack.push(...kept.redo); }
}

function switchChart(id) {
  if (id === workbook.chartId || !workbook.charts.some(c => c.id === id)) return;
  workbook.charts = currentCharts();
  swapHistory(id);
  workbook.chartId = id;
  setState(chartInUse().state);
  saveState();
}

// A chart with nothing in it yet but a Kind style, which new kinds fill in.
const blankState = () => ({
  records: {}, order: {}, archive: [], required: {}, definitions: [], names: { relations: [] },
  views: [{ id: 'view_main', name: 'Structure', layout: {}, styles: [{ id: 'st_kind', param: '[]', label: 'Kind', where: 'every object', map: {} }] }],
});

// Adds a chart, blank or with the given state, after the current one, and makes it current.
function addChart(name, state = blankState()) {
  const charts = currentCharts();
  const chart = { id: newId(), name: freeChartName(name), state };
  charts.splice(charts.findIndex(c => c.id === workbook.chartId) + 1, 0, chart);
  workbook.charts = charts;
  swapHistory(chart.id);
  workbook.chartId = chart.id;
  setState(state);
  saveState();
  return chart.id;
}

const duplicateChart = id => {
  const chart = currentCharts().find(c => c.id === id);
  return addChart(`${chart.name} copy`, structuredClone(chart.state));
};

function renameChart(id, name) {
  if (!clean(name)) return;
  workbook.charts = currentCharts().map(c => c.id === id ? { ...c, name: clean(name) } : c);
  saveState();
}

// Deleting a chart keeps it among the deleted, to be restored. The last chart can't be deleted.
function deleteChart(id) {
  if (workbook.charts.length < 2) return 'A workbook needs at least one chart.';
  const charts = currentCharts();
  const i = charts.findIndex(c => c.id === id);
  workbook.deleted = [{ ...charts[i], when: Date.now() }, ...workbook.deleted];
  workbook.charts = charts.filter(c => c.id !== id);
  undoByChart.delete(id);
  if (id === workbook.chartId) {
    const next = workbook.charts[Math.min(i, workbook.charts.length - 1)];
    const kept = undoByChart.get(next.id);
    undoStack.length = redoStack.length = 0;
    if (kept) { undoStack.push(...kept.undo); redoStack.push(...kept.redo); }
    workbook.chartId = next.id;
    setState(next.state);
  }
  saveState();
  return null;
}

function restoreChart(id) {
  const chart = workbook.deleted.find(c => c.id === id);
  if (!chart) return;
  workbook.deleted = workbook.deleted.filter(c => c !== chart);
  const { when, ...rest } = chart;
  addChart(rest.name, rest.state);
}

function freeChartName(base) {
  const taken = new Set(workbook.charts.map(c => norm(c.name)));
  if (!taken.has(norm(base))) return base;
  for (let n = 2; ; n++) if (!taken.has(norm(`${base} ${n}`))) return `${base} ${n}`;
}

// Copies another chart's formulas and names into this one, as one undoable step. The two stay unsynced:
// later changes to either don't reach the other. A definition with the same name as one here replaces it,
// as does a relation's names.
function copyFormulasFrom(chartId) {
  const source = currentCharts().find(c => c.id === chartId)?.state;
  if (!source) return 'That chart no longer exists.';
  const incoming = structuredClone(source.definitions ?? []);
  const kept = definitions.filter(d => !incoming.some(x => same(x.name, d.name)));
  const relations = source.names?.relations ?? [];
  const keptNames = (names.relations ?? []).filter(r => !relations.some(x => same(x.name, r.name)));
  return changeFormulas([...kept, ...incoming.map(d => ({ ...d, id: newId() }))], { ...names, relations: [...keptNames, ...structuredClone(relations)] });
}

// ---- Computed records ----

// The formulas' last results (see Formulas.computeState in formulas.js), with the effective records.
// Without formulas.js loaded, the records are just the entered ones.
let formulaResult = { records: {}, rows: {} };
const runFormulas = recs => typeof Formulas === 'undefined'
  ? { records: recs, rows: {} } : Formulas.computeState(recs, definitions, names);
function setComputed(result) {
  formulaResult = result;
  records = result.records;
}
const recompute = () => setComputed(runFormulas(entered));
const isComputed = id => !!records[id]?.computed;

// The parts of a record the data model has; a computed record carries more, for the formulas' own use.
const MODEL_KEYS = ['kind', 'at', 'edge', 'args', 'field', 'value', 'tag', 'choice'];
const modelPart = r => Object.fromEntries(MODEL_KEYS.filter(k => k in r).map(k => [k, r[k]]));

// The entered part of records about to be committed: what isn't computed, plus any computed record that
// an edit has changed, which is entered from now on, overriding the formula there. It keeps its id, so
// whatever is located at it stays put. A computed record missing from `next` just comes back.
function enteredPart(next) {
  const out = {};
  for (const [id, r] of Object.entries(next)) {
    if (!r.computed) out[id] = r;
    else if (r !== records[id]) out[id] = modelPart(r);
  }
  return out;
}

// ---- Editing formulas ----

const definitionOf = id => definitions.find(d => d.id === id);

// What the formulas say about a record, or null: for a computed record, { def, labels, reads } (its
// definition, the implications that held and what each read); for an entered record that a formula also
// covers, { def, mark, formula, labels }, where mark is 'agrees', 'differs', 'also implied' or 'overrides'.
const formulaInfo = id => formulaResult.computed?.[id] ?? formulaResult.covered?.[id] ?? null;

// Errors the formulas ran into: a definition's own (it doesn't parse, say), and its records'.
const definitionError = defId => formulaResult.defErrors?.[defId] ?? null;
const recordErrors = defId => (formulaResult.errors ?? []).filter(e => e.def === defId);

// Every change to the formulas or the names they use goes through here, as one undoable step.
function changeFormulas(nextDefinitions, nextNames = names) {
  const result = Formulas.computeState(entered, nextDefinitions, nextNames);
  const error = validate(result.records);
  if (error) return error;
  pushUndo();
  definitions = nextDefinitions;
  names = nextNames;
  setComputed(result);
  saveState();
  return null;
}

// Adds a definition, or replaces the one with its id. Returns why it couldn't, if it couldn't.
const saveDefinition = def => changeFormulas(definitionOf(def.id)
  ? definitions.map(d => d.id === def.id ? def : d) : [...definitions, def]);
const deleteDefinition = id => changeFormulas(definitions.filter(d => d.id !== id));
const saveNames = next => changeFormulas(definitions, next);

// Drops an entered record that a formula covers, so the formula's output stands there again.
function useFormula(id) {
  const { [id]: _, ...rest } = entered;
  return commit(rest);
}

// Records a computed record's output by hand, like Excel's Paste Values. It keeps its id.
function keepAsEntered(id) {
  const r = modelPart(records[id]);
  if (typeof r.value === 'number') r.value = displayValue(records[id]);
  return commit({ ...records, [id]: r });
}

// ---- Views ----

const viewInUse = () => views.find(v => v.id === viewId);

// Switching views isn't an edit, so it isn't undone; an undo goes back to the view its edit was made in.
function switchView(id) {
  if (id === viewId || !views.some(v => v.id === id)) return;
  views = currentViews();
  viewId = id;
  ({ styles, layout } = viewInUse());
  saveState();
}

// A new view starts as a copy of the current one, what it hides included.
function addView(name) {
  pushUndo();
  const view = { id: newId(), name, styles: structuredClone(styles), layout: structuredClone(layout), hidden: [...(viewInUse().hidden ?? [])] };
  views = [...currentViews(), view];
  viewId = view.id;
  saveState();
  return view.id;
}

function renameView(id, name) {
  if (!clean(name)) return;
  pushUndo();
  views = currentViews().map(v => v.id === id ? { ...v, name: clean(name) } : v);
  saveState();
}

// The last view can't be deleted. Deleting the current one moves to its neighbor.
function deleteView(id) {
  if (views.length < 2) return;
  pushUndo();
  const i = views.findIndex(v => v.id === id);
  views = currentViews().filter(v => v.id !== id);
  if (id === viewId) {
    viewId = views[Math.min(i, views.length - 1)].id;
    ({ styles, layout } = viewInUse());
  }
  saveState();
}

function moveView(id, to) {
  pushUndo();
  const list = currentViews();
  const [view] = list.splice(list.findIndex(v => v.id === id), 1);
  list.splice(to, 0, view);
  views = list;
  saveState();
}

const isObject = r => 'kind' in r;
const isField = r => 'field' in r;
const isTag = r => 'tag' in r;
const isChoice = r => 'choice' in r;
const isRelation = r => 'args' in r;
const typeOf = r => isField(r) ? 'field' : isTag(r) ? 'tag' : 'choice';
// An entry's arguments: a path entry's single location, or a relation's several.
const argsOf = r => r.args ?? (r.at ? [{ edge: r.edge, at: r.at }] : []);
const relationLabel = r => r.args.map(a => a.edge).join(' · ');
const labelOf = r => isRelation(r) ? relationLabel(r) : r.edge;

const TYPE_NAMES = { field: 'Field', tag: 'Tag', choice: 'Choice' };
const DATATYPE_NAMES = { text: 'Text', number: 'Number', date: 'Date' };

let idCounter = 0;
const newId = () => `r${Date.now().toString(36)}${(idCounter++).toString(36)}`;

// ---- Field values ----

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function monthNumber(word) {
  const w = word.toLowerCase().replace(/\.$/, '');
  return MONTHS.findIndex(m => m.toLowerCase() === w || m.slice(0, 3).toLowerCase() === w || (w === 'sept' && m === 'September')) + 1;
}

// Reads 2019-03-04, 3/4/2019, March 4, 2019, Mar. 4, 2019 or 4 March 2019 as an ISO date, or returns null.
function parseDate(s) {
  let m, y, mo, d;
  if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/))) [, y, mo, d] = m;
  else if ((m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/))) [, mo, d, y] = m;
  else if ((m = s.match(/^([A-Za-z]+\.?) (\d{1,2}),? (\d{4})$/))) [y, mo, d] = [m[3], monthNumber(m[1]), m[2]];
  else if ((m = s.match(/^(\d{1,2}) ([A-Za-z]+\.?),? (\d{4})$/))) [y, mo, d] = [m[3], monthNumber(m[2]), m[1]];
  else return null;
  [y, mo, d] = [y, mo, d].map(Number);
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (!mo || date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) return null;
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}
const formatDate = iso => {
  const [y, m, d] = iso.split('-').map(Number);
  return `${MONTHS[m - 1]} ${d}, ${y}`;
};

// Amounts like 1,000, $750,000,000 or 12.5%. A leading zero (0803456789) marks an identifier, which stays text.
const NUMBER = /^[-+]?\$?(\d{1,3}(,\d{3})+|\d+)(\.\d+)?%?$/;
const isNumber = s => NUMBER.test(s) && !/^[-+]?\$?0\d/.test(s);

const classify = s => parseDate(s) ? 'date' : isNumber(s) ? 'number' : 'text';
const asPhrase = datatype => datatype === 'text' ? 'text' : `a ${datatype}`;

// Dates are stored as ISO strings. Numbers and text keep the form they were typed in,
// so an identifier that happens to be all digits still shows as typed.
function parseValue(datatype, raw) {
  const s = clean(raw);
  if (!s) return undefined;
  if (datatype === 'date') return parseDate(s) ?? undefined;
  if (datatype === 'number') return isNumber(s) ? s : undefined;
  return s;
}
// A computed number is a number rather than text as typed, shown as a percentage if its definition says so.
const displayValue = r => r.field === 'date' ? formatDate(r.value?.iso ?? r.value)
  : typeof r.value === 'number' ? formatNumber(r.value, definitions.find(d => d.id === r.computed)?.percent) : r.value;
function formatNumber(n, percent) {
  const digits = v => v.toLocaleString('en-US', { maximumFractionDigits: 2 });
  return percent ? `${digits(n * 100)}%` : digits(n);
}

// ---- Reading the state ----

const isObjectName = (id, recs = records) => isField(recs[id]) && same(recs[id].edge, 'name') && isObject(recs[recs[id].at]);

// Compares { type, label } items: labels in the order they've been dragged into come first, in that order;
// the rest follow as fields, tags, then choices, alphabetical within each.
const TYPE_RANK = { field: 0, tag: 1, choice: 2 };
function orderedBy(placed) {
  const rank = label => { const i = placed.indexOf(norm(label)); return i < 0 ? Infinity : i; };
  return (a, b) => rank(a.label) - rank(b.label) || TYPE_RANK[a.type] - TYPE_RANK[b.type] || byLabel(a.label, b.label);
}

// Name first, then the order shared by locations with the same specification.
function entriesOf(id, recs = records) {
  const ids = Object.keys(recs).filter(k => recs[k].at === id);
  if (ids.length < 2) return ids;
  const compare = orderedBy(order[specKey(recs, id)] ?? []);
  const item = k => ({ type: typeOf(recs[k]), label: recs[k].edge });
  return ids.sort((a, b) => isObjectName(b, recs) - isObjectName(a, recs) || compare(item(a), item(b)));
}

function objectName(id, recs = records) {
  const nameId = entriesOf(id, recs).find(k => isObjectName(k, recs));
  return nameId ? recs[nameId].value : `${recs[id].kind} ${id}`;
}
const nameRecordOf = id => entriesOf(id).find(k => isObjectName(k));

const objectsOfKind = kind => Object.keys(records)
  .filter(k => isObject(records[k]) && same(records[k].kind, kind))
  .sort((a, b) => byLabel(objectName(a), objectName(b)));

// The kinds in the state, each as first written.
const kindsInState = () => [...new Map(Object.values(records).filter(isObject).map(r => [norm(r.kind), r.kind])).values()].sort(byLabel);

// Locations up to the object, ordered object-first like a file path.
function pathTo(id) {
  const path = [];
  for (let cur = id; cur; cur = records[cur].at) path.unshift(cur);
  return path;
}
// The object a location belongs to: the start of its path.
const objectOf = id => pathTo(id)[0];

// A record's underlying specification, serialized: an object's kind, or an entry's root label followed by
// each argument's edge and its location's specification, sorted, since the tree is unordered.
// States are never mutated, so each one's keys are worked out once.
const specCache = new WeakMap();
function specKey(recs, id) {
  if (!specCache.has(recs)) specCache.set(recs, new Map());
  const cache = specCache.get(recs);
  if (!cache.has(id)) {
    const r = recs[id];
    cache.set(id, isObject(r) ? `kind:${norm(r.kind)}` : JSON.stringify([rootLabel(r), ...argSpecs(recs, r)]));
  }
  return cache.get(id);
}
const rootLabel = r => isTag(r) ? `tag:${r.tag}` : isChoice(r) ? `choice:${norm(r.choice)}` : `field:${r.field}`;
const argSpecs = (recs, r) => argsOf(r).map(a => JSON.stringify([norm(a.edge), specKey(recs, a.at)])).sort();

// The record's underlying specification with its root label removed. Every object's is the same:
// a lone unlabeled node, whose outputs are the kinds.
const parameterization = (recs, id) => JSON.stringify(argSpecs(recs, recs[id]));

// The record's output, the label of its root, as a key: its kind, Boolean, option or datatype.
const outputKey = r => isObject(r) ? norm(r.kind) : isTag(r) ? String(r.tag) : isChoice(r) ? norm(r.choice) : r.field;
const outputText = r => isObject(r) ? r.kind : isTag(r) ? (r.tag ? 'Attested' : 'Ruled out') : isChoice(r) ? r.choice : DATATYPE_NAMES[r.field];

// The fields that relations like this one have located at them, as { label, datatype }: relations with the
// same edges and output, whatever kinds their sides are, so ownership by a new kind of owner is offered a
// Percentage too. A ruled-out tag has none.
function detailFieldsOf(id) {
  const r = records[id];
  const shape = s => JSON.stringify([typeOf(s), isTag(s) && s.tag, s.args.map(a => norm(a.edge)).sort()]);
  if (isTag(r) && !r.tag) return [];
  const fields = new Map();
  for (const s of Object.values(records)) {
    const loc = s.at && records[s.at];
    if (isField(s) && loc && isRelation(loc) && shape(loc) === shape(r) && !fields.has(norm(s.edge)))
      fields.set(norm(s.edge), { label: s.edge, datatype: s.field });
  }
  return [...fields.values()];
}

// Relations with an argument at `id`.
const relationsAt = (id, recs = records) =>
  Object.keys(recs).filter(k => isRelation(recs[k]) && recs[k].args.some(a => a.at === id));
const hasEntries = id => entriesOf(id).length > 0 || relationsAt(id).length > 0;

// Every record whose path starts at the object, the object included.
const recordsUnder = obj => Object.keys(records).filter(k => !isRelation(records[k]) && objectOf(k) === obj);

// How a record reads as one segment of a path.
function segmentText(id) {
  const r = records[id];
  if (isObject(r)) return objectName(id);
  if (isRelation(r)) return relationLabel(r);
  if (isTag(r)) return `${r.tag ? '' : 'Not '}${r.edge}`;
  return isChoice(r) ? `${r.edge}: ${r.choice}` : r.edge;
}

// The options a choice's parameterization has across the state, for its dropdown.
function outputsOf(id) {
  const p = parameterization(records, id);
  const outputs = [];
  for (const [k, r] of Object.entries(records))
    if (isChoice(r) && parameterization(records, k) === p && !outputs.some(o => same(o, r.choice))) outputs.push(r.choice);
  return outputs.sort(byLabel);
}

// The relations at a location, grouped into the rows that show them there: one per output type and
// split of the relation's edges into this location's own and the others'. A row is labeled with the
// other edges, in the order the relation lists its arguments.
function relationGroups(at) {
  const groups = new Map();
  for (const id of relationsAt(at)) {
    const r = records[id];
    const own = r.args.filter(a => a.at === at).map(a => a.edge);
    const others = r.args.filter(a => a.at !== at).map(a => a.edge);
    const key = JSON.stringify([typeOf(r), own.map(norm).sort(), others.map(norm).sort()]);
    if (!groups.has(key)) groups.set(key, { key, type: typeOf(r), own, others, ids: [] });
    groups.get(key).ids.push(id);
  }
  return [...groups.values()].sort((a, b) => byLabel(a.others.join(' '), b.others.join(' ')));
}

// The two-argument relations that a location like `at` could take part in, from those already in the state:
// one per output type and pair of edges, with every specification seen on the other side.
function relationTypesAt(at) {
  const spec = specKey(records, at);
  const types = new Map();
  for (const r of Object.values(records)) {
    if (!isRelation(r) || r.args.length !== 2) continue;
    r.args.forEach((own, i) => {
      if (specKey(records, own.at) !== spec) return;
      const other = r.args[1 - i];
      const key = JSON.stringify([typeOf(r), [norm(own.edge)], [norm(other.edge)]]);
      if (!types.has(key)) types.set(key, { key, type: typeOf(r), own: own.edge, other: other.edge, ownFirst: i === 0, otherSpecs: new Set(), datatype: r.field, outputs: [] });
      const t = types.get(key);
      t.otherSpecs.add(specKey(records, other.at));
      if (isChoice(r) && !t.outputs.some(o => same(o, r.choice))) t.outputs.push(r.choice);
    });
  }
  return [...types.values()].sort((a, b) => byLabel(a.other, b.other));
}

// The parameterizations the records imply for entries of locations like `at` (same underlying specification),
// one per type and label, with each field's datatype and each choice's outputs.
function schemaAt(at, exceptId) {
  const key = specKey(records, at);
  const params = new Map();
  for (const [id, r] of Object.entries(records)) {
    if (!r.at || id === exceptId || specKey(records, r.at) !== key) continue;
    const k = `${typeOf(r)}:${norm(r.edge)}`;
    if (!params.has(k)) params.set(k, { type: typeOf(r), label: r.edge, datatype: r.field, outputs: [] });
    const p = params.get(k);
    if (isChoice(r) && !p.outputs.some(o => same(o, r.choice))) p.outputs.push(r.choice);
  }
  return [...params.values()];
}

// The datatype other fields with this label already have at locations like `at`, if any.
const fieldDatatype = (at, label, exceptId) =>
  schemaAt(at, exceptId).find(p => p.type === 'field' && same(p.label, label))?.datatype;

// Returns a message for the first way `recs` fails to be a state, or null if it is one.
function validate(recs) {
  // Two entries with the same edges to the same locations would share an argumentation.
  const seen = new Set();
  for (const r of Object.values(recs)) {
    if (isObject(r)) continue;
    if (argsOf(r).some(a => !recs[a.at])) return 'Something it’s located at no longer exists.';
    const key = JSON.stringify(argsOf(r).map(a => JSON.stringify([norm(a.edge), a.at])).sort());
    if (seen.has(key)) return isRelation(r) ? 'That relation is already recorded.' : `There’s already an entry called ${r.edge} here.`;
    seen.add(key);
  }
  for (const [id, r] of Object.entries(recs)) {
    if (isObject(r) && !entriesOf(id, recs).some(e => isObjectName(e, recs)))
      return `Every ${r.kind.toLowerCase()} needs a Name.`;
  }
  // Schema conditions on the specifications the records imply.
  const byParameterization = new Map();
  for (const id of Object.keys(recs)) {
    if (isObject(recs[id])) continue;
    const p = parameterization(recs, id);
    if (!byParameterization.has(p)) byParameterization.set(p, []);
    byParameterization.get(p).push(recs[id]);
  }
  for (const rs of byParameterization.values()) {
    const edge = labelOf(rs[0]);
    const datatypes = [...new Set(rs.filter(isField).map(r => r.field))];
    if (datatypes.length > 1)
      return `${edge} can’t be both a ${datatypes[0]} field and a ${datatypes[1]} field.`;
    if (rs.some(isChoice) && rs.some(r => isTag(r) || isField(r)))
      return `${edge} can’t be both a choice and a ${rs.some(isTag) ? 'tag' : 'field'}.`;
    if (rs.some(isTag) && rs.some(isField))
      return `${edge} can’t be both a tag and a field.`;
  }
  return null;
}

// ---- Changing the state ----

// Replaces the records, if the result is a state; otherwise returns why not.
// `next` is what `records` should become; its entered part is kept, and the formulas worked out again.
function commit(next) {
  const nextEntered = enteredPart(next);
  const result = runFormulas(nextEntered);
  const error = validate(result.records);
  if (error) return error;
  pushUndo();
  const before = records;
  entered = nextEntered;
  setComputed(result);
  if (rekey(before, records)) recompute();
  saveState();
  return null;
}

// What's keyed by specification follows the records it was keyed by. When an edit changes records'
// specifications (an edge relabeled, or an entry moved up a level, which changes its dependents' too),
// each key that no record has any more moves to the key those records have now, unless that one is taken:
// entry order by location specification, and styles and required entries by parameterization.
function rekey(before, after) {
  const specs = new Map(), params = new Map();
  for (const id of Object.keys(after)) {
    if (!before[id]) continue;
    const s0 = specKey(before, id), s1 = specKey(after, id);
    if (s0 === s1) continue;
    specs.set(s0, s1);
    if (!isObject(after[id])) params.set(parameterization(before, id), parameterization(after, id));
  }
  if (!specs.size) return;
  const liveSpecs = new Set(Object.keys(after).map(id => specKey(after, id)));
  const liveParams = new Set(Object.keys(after).filter(id => !isObject(after[id])).map(id => parameterization(after, id)));
  const moves = (map, live) => [...map].filter(([from]) => !live.has(from));
  for (const [from, to] of moves(specs, liveSpecs))
    if (order[from] && !order[to]) { const { [from]: list, ...rest } = order; order = { ...rest, [to]: list }; }
  const paramMoves = moves(params, liveParams);
  // Every view's styles follow, not just the current view's.
  const restyle = list => paramMoves.reduce((acc, [from, to]) =>
    acc.some(s => s.param === to) ? acc : acc.map(s => s.param === from ? { ...s, param: to } : s), list);
  views = currentViews().map(v => ({ ...v, styles: restyle(v.styles) }));
  styles = viewInUse().styles;
  for (const [from, to] of paramMoves)
    if (required[from] && !required[to]) { const { [from]: req, ...rest } = required; required = { ...rest, [to]: req }; }
  // So do the parameterizations formulas cover. A definition written with locations is rewritten with the
  // keys it covers, keeping a relation's edges in their order, so it can follow.
  const moved = new Map(paramMoves);
  let changed = false;
  definitions = definitions.map(d => {
    let keys;
    try { keys = Formulas.coversOf(d); } catch { return d; }
    if (!keys.some(k => moved.has(k))) return d;
    changed = true;
    const { at, args, ...rest } = d;
    return { ...rest, covers: keys.map(k => moved.get(k) ?? k), ...(args ? { args: args.map(a => ({ edge: a.edge })) } : {}) };
  });
  return changed;
}

// Moves an entry to just before or after a sibling. Every location with the same specification follows suit.
function moveEntry(id, targetId, after) {
  const at = records[id].at;
  const key = specKey(records, at);
  // Every label used at locations like this one, as currently shown, so labels this record lacks keep their places.
  const list = [...new Set(schemaAt(at).sort(orderedBy(order[key] ?? [])).map(p => norm(p.label)))];
  const moved = norm(records[id].edge);
  list.splice(list.indexOf(moved), 1);
  const to = isObjectName(targetId) ? 0 : list.indexOf(norm(records[targetId].edge)) + (after ? 1 : 0);
  list.splice(to, 0, moved);
  pushUndo();
  order = { ...order, [key]: list };
  saveState();
}

// A renamed entry keeps its place: its new label goes right after its old one in the shared order,
// which stays put for the other locations that still use it.
function keepPlace(at, oldLabel, newLabel) {
  const key = specKey(records, at);
  const list = order[key];
  if (!list || list.includes(norm(newLabel)) || !list.includes(norm(oldLabel))) return;
  const next = [...list];
  next.splice(next.indexOf(norm(oldLabel)) + 1, 0, norm(newLabel));
  order = { ...order, [key]: next };
  saveState();
}

// Saves a field's value typed in place. Its datatype is the one other fields with its parameterization
// have, or else a guess from the value. Returns why it couldn't be saved, if it couldn't. A computed value
// left as it was shown isn't an override: a computed number is a number, not the text it shows as.
function saveFieldValue(id, raw, label = labelOf(records[id])) {
  const r = records[id];
  if (isComputed(id) && clean(raw) === displayValue(r)) return null;
  const p = parameterization(records, id);
  const fixed = Object.keys(records).find(k => k !== id && isField(records[k]) && parameterization(records, k) === p);
  const datatype = fixed ? records[fixed].field : isObjectName(id) ? 'text' : classify(clean(raw));
  const value = parseValue(datatype, raw);
  if (value === undefined) return clean(raw) ? `${label} takes ${asPhrase(datatype)} here.` : `${label} can’t be empty.`;
  if (datatype === r.field && value === r.value) return null;
  return commit({ ...records, [id]: { ...r, field: datatype, value } });
}

// Adds a field typed in place at a location, such as a Percentage at a new ownership. Its datatype is the
// one other fields with its parameterization have, or else `datatype`, or else a guess from the value.
// Nothing typed adds nothing. Returns why it couldn't be added, if it couldn't.
function addFieldValue(at, label, raw, datatype) {
  if (!clean(raw)) return null;
  const type = fieldDatatype(at, label) ?? datatype ?? classify(clean(raw));
  const value = parseValue(type, raw);
  if (value === undefined) return `${label} takes ${asPhrase(type)} here.`;
  return commit({ ...records, [newId()]: { at, edge: label, field: type, value } });
}

// Creates an object of a kind with its Name, returning its id, or a message saying why it couldn't.
// A new kind gets the preset styles in the same step, so one undo takes both back.
function createObject(kind, name, place) {
  const id = newId();
  const error = commit({ ...records, [id]: { kind }, [newId()]: { at: id, edge: 'Name', field: 'text', value: clean(name) } });
  if (error) return { error };
  ensureKindStyles(kind);
  if (place) layout = { ...layout, [id]: place };
  saveState();
  return { id };
}

// Moves an entry up a level, from its location to that location's own location. Its dependents follow,
// since they're located at it. Returns why it couldn't, if it couldn't.
function moveUp(id) {
  const r = records[id];
  const loc = records[r.at];
  if (!loc || isObject(loc) || isRelation(loc)) return `${r.edge} is already at the top level.`;
  return commit({ ...records, [id]: { ...r, at: loc.at } });
}

// ---- Required entries ----

// The parameterization an entry labeled `label` would have at a location.
const paramAt = (label, at) => JSON.stringify([JSON.stringify([norm(label), specKey(records, at)])]);

// Makes an entry's parameterization required at every location like its own, or stops requiring it.
function toggleRequired(id) {
  const r = records[id];
  const p = parameterization(records, id);
  pushUndo();
  if (required[p]) { const { [p]: _, ...rest } = required; required = rest; }
  else required = { ...required, [p]: { label: r.edge, type: typeOf(r), datatype: r.field } };
  saveState();
}

function stopRequiring(param) {
  pushUndo();
  const { [param]: _, ...rest } = required;
  required = rest;
  saveState();
}

// The required entries a location has no entry for, as [param, { label, type }] pairs.
// A tag counts as recorded whether it's attested or ruled out.
function missingAt(at) {
  if (!records[at] || isField(records[at])) return [];
  return Object.entries(required).filter(([p, req]) =>
    p === paramAt(req.label, at) && !entriesOf(at).some(e => parameterization(records, e) === p));
}

// The required entries missing anywhere in an object, or below a location: each with where it's missing.
function missingUnder(id) {
  const out = [];
  const walk = at => {
    for (const [param, req] of missingAt(at)) out.push({ at, param, ...req });
    for (const e of entriesOf(at)) if (!isField(records[e])) walk(e);
  };
  if (records[id]) walk(id);
  return out;
}

// ---- Deleting and restoring ----

// A set of records with everything that depends on them: every entry located at one of them, at any
// depth, and every relation one of them is an argument of, with whatever depends on those in turn.
function withDependents(ids) {
  const all = new Set(ids);
  for (let grew = true; grew;) {
    grew = false;
    for (const [k, r] of Object.entries(records))
      if (!all.has(k) && argsOf(r).some(a => all.has(a.at))) { all.add(k); grew = true; }
  }
  return all;
}

// Deleting hides rather than destroys: the records and their dependents go into the archive as a batch,
// labeled with what was deleted, and can be restored from there. Returns why it couldn't, if it couldn't.
// Only entered records are archived: computed ones go with what they were computed from, and come back
// with it. Box positions are kept in every view, so a restored box returns to its place in each.
function deleteRecords(ids, label) {
  const gone = withDependents(ids);
  const nextEntered = Object.fromEntries(Object.entries(entered).filter(([k]) => !gone.has(k)));
  const result = runFormulas(nextEntered);
  const error = validate(result.records);
  if (error) return error;
  pushUndo();
  const kept = Object.fromEntries([...gone].filter(k => entered[k]).map(k => [k, entered[k]]));
  archive = [{ id: newId(), label, when: Date.now(), records: kept }, ...archive];
  entered = nextEntered;
  setComputed(result);
  saveState();
  return null;
}

// Puts a deleted batch back. Something it depends on may have been deleted since, in which case that
// needs restoring first.
function restoreBatch(batchId) {
  const batch = archive.find(b => b.id === batchId);
  const nextEntered = { ...entered, ...batch.records };
  const result = runFormulas(nextEntered);
  const missing = Object.values(batch.records).flatMap(argsOf).map(a => a.at).find(at => !result.records[at]);
  if (missing) {
    const other = archive.find(b => b.records[missing]);
    return other ? `Restore ${other.label} first; this depends on it.` : 'Something this depends on no longer exists.';
  }
  const error = validate(result.records);
  if (error) return `Can’t restore it: ${error}`;
  pushUndo();
  entered = nextEntered;
  setComputed(result);
  // Batches deleted before views kept the current view's box positions.
  if (batch.layout) layout = { ...layout, ...batch.layout };
  archive = archive.filter(b => b !== batch);
  saveState();
  return null;
}

// ---- Chart helpers ----

// What a view hides one by one, beyond what its styles hide: boxes and lines, by record id. It's kept on
// the view itself, so it goes with the view's copies and its undo history.
const hiddenInView = () => viewInUse().hidden ?? [];

function setHiddenInView(ids) {
  pushUndo();
  views = currentViews().map(v => v.id === viewId ? { ...v, hidden: [...new Set(ids)] } : v);
  saveState();
}

// A copy of a view, everything in it included, placed just after it and made current.
function duplicateView(id, name) {
  pushUndo();
  const list = currentViews();
  const i = list.findIndex(v => v.id === id);
  const copy = { ...structuredClone(list[i]), id: newId(), name };
  list.splice(i + 1, 0, copy);
  views = list;
  viewId = copy.id;
  ({ styles, layout } = copy);
  saveState();
  return copy.id;
}

// A view name not taken yet: the name itself, or with a number after it.
function freeViewName(base) {
  const taken = new Set(views.map(v => norm(v.name)));
  if (!taken.has(norm(base))) return base;
  for (let n = 2; ; n++) if (!taken.has(norm(`${base} ${n}`))) return `${base} ${n}`;
}

// ---- Panel helpers ----

// Commits records and the formulas together, as one undoable step: for a formula typed into a value box,
// which replaces that value with the formula's output, and for a relabeled entry, which relabels what
// formulas say about it. `next` is what `records` should become, as for commit().
function commitWithFormulas(next, nextDefinitions, nextNames = names) {
  const nextEntered = enteredPart(next);
  const result = Formulas.computeState(nextEntered, nextDefinitions, nextNames);
  const error = validate(result.records);
  if (error) return error;
  pushUndo();
  const before = records;
  entered = nextEntered;
  definitions = nextDefinitions;
  names = nextNames;
  setComputed(result);
  if (rekey(before, records)) recompute();
  saveState();
  return null;
}

// ---- Rename helpers ----

// What a record is like, for a rename that covers every one like it: an object, its kind; a relation, its
// output type and edge labels, whatever kinds it relates; an entry, its type and label under what its
// location is like, whatever option or attestation that location has. So every ownership is like every
// other, and every Tax Classification under an Entity's Entity Type is like every other.
function likeKey(id) {
  const r = records[id];
  if (isObject(r)) return `kind:${norm(r.kind)}`;
  if (isRelation(r)) return `rel:${typeOf(r)}:${r.args.map(a => norm(a.edge)).sort().join('|')}`;
  return `${likeKey(r.at)} › ${typeOf(r)}:${norm(r.edge)}`;
}

// The entered entries like an entry, and the entered relations like a relation, itself included. Computed
// ones follow their definition instead.
const entriesLike = id => Object.keys(records).filter(k => !isObject(records[k]) && !isRelation(records[k]) && !isComputed(k) && likeKey(k) === likeKey(id));
const relationsLike = id => Object.keys(records).filter(k => isRelation(records[k]) && !isComputed(k) && likeKey(k) === likeKey(id));

// A relation's edge relabeled in the pilot names: the relation's own edges and the keys of its lists, for
// the names whose relation is like `id`. The list names themselves stay as they are.
function namesWithEdge(id, from, to) {
  const swap = s => same(s, from) ? to : s;
  const key = likeKey(id);
  const relations = (names.relations ?? []).map(n => `rel:${n.type}:${n.edges.map(norm).sort().join('|')}` !== key ? n : {
    ...n, edges: n.edges.map(swap),
    lists: Object.fromEntries(Object.entries(n.lists ?? {}).map(([k, v]) => [swap(k), Object.fromEntries(Object.entries(v).map(([k2, l]) => [swap(k2), l]))])),
  });
  return { ...names, relations };
}

// A relation's edge relabeled in the formulas that mention it: as a name after a dot (a linked record's
// argument), in a labeled relation call, or as a list that goes by the edge for want of a pilot name.
// A computed relation's formulas are left alone where the label is one of its own arguments.
const definitionsWithEdge = (from, to) => definitions.map(d => d.args?.some(a => same(a.edge, from)) ? d : {
  ...d,
  ...(d.formula !== undefined && { formula: Formulas.renameName(d.formula, from, to) }),
  ...(d.implications && { implications: d.implications.map(i => ({ ...i, formula: Formulas.renameName(i.formula, from, to) })) }),
});

// Relabels an edge on a relation, here only or on every relation like it. Every one carries the new label
// through the pilot names and the formulas too, in the same undoable step. Returns why it couldn't, if it
// couldn't.
function renameEdge(id, from, to, every) {
  const relabel = r => ({ ...r, args: r.args.map(a => same(a.edge, from) ? { ...a, edge: to } : a) });
  const next = { ...records };
  for (const k of every ? relationsLike(id) : [id]) next[k] = relabel(records[k]);
  return every ? commitWithFormulas(next, definitionsWithEdge(from, to), namesWithEdge(id, from, to)) : commit(next);
}

// ---- View filter helpers ----

// What a view shows besides its styles and the things hidden one by one: a filter, a condition worked
// out at each object that shows the boxes it holds for, and the kinds whose boxes it hides. Both are kept
// on the view, like its hidden list, so its copies and undo take them along.
const viewFilter = () => viewInUse().filter ?? '';
const hiddenKinds = () => viewInUse().hiddenKinds ?? [];

function setViewFilter(text) {
  pushUndo();
  views = currentViews().map(v => v.id === viewId ? { ...v, filter: String(text ?? '').trim() } : v);
  saveState();
}

function setHiddenKinds(kinds) {
  pushUndo();
  views = currentViews().map(v => v.id === viewId ? { ...v, hiddenKinds: [...new Set(kinds.map(norm))] } : v);
  saveState();
}
