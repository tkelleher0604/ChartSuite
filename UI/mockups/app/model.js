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

// The workbook is saved under WORKBOOK_KEY.
const WORKBOOK_KEY = 'rboreal.workbook.v2';
const SAMPLE_CHART_NAME = 'Calder Ridge Fund III structure';

// A chart's state is its schema and records, plus what goes with them:
// - schema: the chart's schema S, kept explicitly (see "The schema" below);
// - entered: the records typed in. `records` is what everything reads: the entered records together with
//   those the chart's formulas compute (see formulas.md), worked out again after every change;
// - definitions: the formulas, each covering a set of parameterizations; names: the names of relations
//   and of their lists of relatives, by form;
// - required: the parameterizations every location like theirs should have an entry for;
// - order: the order entries are shown in, kept per location specification, so that, say, every Entity
//   lists its entries in the same order, the way a spreadsheet's rows share its columns;
// - views: the chart's views, each with its own styles (see styles.js), box positions, hidden records and
//   filter. The records are the same in every view. `styles` and `layout` are the current view's, written
//   back into `views` on save;
// - archive: deleted records, kept in batches so each can be restored with its dependents.
// Semantics is keyed by parameterization (formulas, required entries), looks and vocabulary by form (styles,
// names), and placement by location (entry order by location specification, box positions by object).
let schema, entered, records, definitions, names, order, views, viewId, styles, layout, required, archive;
const undoStack = [];
const redoStack = [];

function setState(s) {
  ({ schema = {}, records: entered, definitions = [], names = {}, order = {}, views, viewId = null, required = [], archive = [] } = s);
  recompute();
  // The schema holds what the formulas compute, as well as what's entered.
  schema = withSpecsOf(schema, records);
  if (!views.some(v => v.id === viewId)) viewId = views[0].id;
  const view = views.find(v => v.id === viewId);
  styles = view.styles;
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
  } catch {}
  workbook = { charts: [{ id: 'chart_main', name: SAMPLE_CHART_NAME, state: sampleState(), sample: true }], chartId: 'chart_main', deleted: [] };
  setState(chartInUse().state);
}

// The sample: its records, its schema (theirs, and what its formulas declare), its formulas and names in
// their stored form, and its views. It requires a Formation Date on every Entity, which two portfolio
// companies lack.
function sampleState() {
  const recs = structuredClone(SAMPLE);
  const { definitions: defs, names: nms, schema: S } = sampleFormulas(recs);
  return {
    schema: S, records: recs, order: {}, archive: [], definitions: defs, names: nms,
    views: sampleViews(recs, S, defs).map(v => ({ ...v, layout: structuredClone(SAMPLE_LAYOUT) })),
    required: [parameterization(recs, 'fund_formed')],
  };
}

// The sample's formulas and names in their stored form, with the schema of its records and what the
// formulas declare. The formula lab works from these too.
const sampleFormulas = (recs = SAMPLE) => canonicalFormulas(SAMPLE_DEFINITIONS, SAMPLE_NAMES, withSpecsOf({}, recs));

// States are never mutated in place, so earlier ones can be kept for undo.
const currentViews = () => views.map(v => v.id === viewId ? { ...v, styles, layout } : v);
const snapshot = () => ({ schema, records: entered, definitions, names, order, views: currentViews(), viewId, required, archive });

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
// Whether the current chart is the sample, which Reset sample puts back as it started.
const isSampleChart = () => !!(chartInUse()?.sample ?? chartInUse()?.id === 'chart_main');
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
  schema: {}, records: {}, order: {}, archive: [], required: [], definitions: [], names: {},
  views: [{ id: 'view_main', name: 'Structure', layout: {}, styles: [{ id: 'st_kind', form: 'object', map: {} }] }],
});

// Adds a chart, blank or with the given state, after the current one, and makes it current.
function addChart(name, state = blankState(), more = {}) {
  const charts = currentCharts();
  const chart = { id: newId(), name: freeChartName(name), state, ...more };
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
  addChart(rest.name, rest.state, rest.sample ? { sample: true } : {});
}

function freeChartName(base) {
  const taken = new Set(workbook.charts.map(c => norm(c.name)));
  if (!taken.has(norm(base))) return base;
  for (let n = 2; ; n++) if (!taken.has(norm(`${base} ${n}`))) return `${base} ${n}`;
}

// Copies another chart's definitions and names into this one, as one undoable step. The two stay unsynced:
// later changes to either don't reach the other. The specifications the definitions cover and the names name
// come along into this chart's schema, with their locations. A definition covering what one here covers
// replaces it, and so does a relation's name for the same form.
function copyDefinitionsFrom(chartId) {
  const source = currentCharts().find(c => c.id === chartId)?.state;
  if (!source) return 'That chart no longer exists.';
  const incoming = structuredClone(source.definitions ?? []);
  const theirs = new Set(incoming.flatMap(d => d.scope));
  const named = new Set(Object.keys(source.names ?? {}));
  const S = withTrees(schema, Object.values(source.schema ?? {}).filter(t => theirs.has(treeParam(t)) || named.has(formOfTree(t))));
  const kept = definitions.filter(d => !d.scope.some(p => theirs.has(p)));
  return change({ schema: S, definitions: [...kept, ...incoming.map(d => ({ ...d, id: newId() }))], names: { ...names, ...structuredClone(source.names ?? {}) } });
}

// ---- Computed records ----

// The formulas' last results (see Formulas.computeState in formulas.js), with the effective records.
// Without formulas.js loaded, the records are just the entered ones.
let formulaResult = { records: {}, rows: {} };
const runFormulas = (recs, defs = definitions, nms = names, S = schema) => typeof Formulas === 'undefined'
  ? { records: recs, rows: {} } : Formulas.computeState(recs, engineDefinitions(defs, nms, S), engineNames(nms, S));
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

// ---- Formulas ----
// A definition is stored as { id, scope, formula } or { id, scope, implications: [{ label, formula }] },
// with `self` if its relation may relate a thing to itself. Its scope is the set of parameterizations it
// covers; everything else about it comes from the schema (its type, a field's datatype, a choice's options)
// and, for a relation, from the names (its name and the order of its edges). An entry's formula is named by
// its label.
//
// Two other forms are worked out from it: the one formulas.js takes (engineDefinitions), and the one people
// write and edit, which names what it covers by locations written as paths from a kind, like
// 'Entity › Entity Type: Limited Partnership' (asWritten). canonicalFormulas turns the second back.

// A location written as a path from a kind, as a tree: 'Entity › Entity Type: Limited Partnership'.
// A segment 'Edge: Option' is a choice; 'Edge' an attested tag, 'Not Edge' a ruled-out one.
function locationTree(text) {
  const [kind, ...segs] = String(text).split('›').map(s => clean(s));
  return segs.reduce((loc, seg) => {
    const i = seg.indexOf(':');
    if (i > 0) return { out: { choice: clean(seg.slice(i + 1)) }, args: [{ edge: clean(seg.slice(0, i)), loc }] };
    const not = /^not\s+/i.test(seg);
    return { out: { tag: !not }, args: [{ edge: not ? seg.replace(/^not\s+/i, '') : seg, loc }] };
  }, { kind });
}

// A location tree as a path from its kind; null if it isn't one (a relation, or below one).
function pathText(t) {
  if (t.kind !== undefined) return t.kind;
  if (t.args.length !== 1 || 'field' in t.out) return null;
  const up = pathText(t.args[0].loc);
  if (up === null) return null;
  const edge = t.args[0].edge;
  return `${up} › ${'choice' in t.out ? `${edge}: ${t.out.choice}` : `${t.out.tag ? '' : 'Not '}${edge}`}`;
}

// A parameterization's parameters: [{ edge, key }], each edge label (normalized) with its location's key.
const paramArgs = p => JSON.parse(p).map(a => { const [edge, key] = JSON.parse(a); return { edge, key }; });

// The options written into a formula, as a choice's formula may give them.
// The options a choice definition gives as written: texts in the places its value comes from (see formulas.js).
const writtenOptions = d => [d.formula, ...(d.implications ?? []).map(i => i.formula)].filter(Boolean).flatMap(Formulas.optionsWritten);

// A definition as people write it, from the stored one: its name, type and datatype, and what it covers as
// locations. A relation's locations are given per edge. Where a location isn't a path from a kind (it's a
// relation, or below one), the parameterizations are given in `covers` instead.
function asWritten(d, S = schema, N = names) {
  const trees = d.scope.flatMap(p => specsWithParam(p, S));
  const t = trees[0];
  const type = t ? typeOfTree(t) : 'tag';
  const isRel = d.scope.some(p => paramArgs(p).length > 1);
  const form = isRel && t ? formOfTree(t) : null;
  const rule = d.implications ? { implications: d.implications } : { formula: d.formula };
  const base = { id: d.id, type, ...(type === 'field' ? { datatype: t.out.field } : {}), ...(d.self ? { self: true } : {}), ...rule };
  const textOf = key => S[key] ? pathText(S[key]) : null;
  const pairs = d.scope.flatMap(paramArgs);
  const edges = isRel ? (form && N[form]?.edges) ?? t?.args.map(a => a.edge) ?? [] : [];
  const name = isRel ? (form ? formName(form, S, N) : edges.join(' · ')) : t?.args[0].edge ?? pairs[0]?.edge ?? '';
  if (pairs.some(a => textOf(a.key) === null))
    return { ...base, name, covers: d.scope, ...(isRel ? { args: edges.map(edge => ({ edge })) } : {}) };
  if (!isRel) return { ...base, name, at: [...new Set(pairs.map(a => textOf(a.key)))] };
  return { ...base, name, args: edges.map(edge => ({ edge, at: [...new Set(pairs.filter(a => same(a.edge, edge)).map(a => textOf(a.key)))] })) };
}

// The definitions as people write them, and one by id.
const allDefinitions = () => definitions.map(d => asWritten(d));
const definitionOf = id => { const d = definitions.find(x => x.id === id); return d ? asWritten(d) : null; };
// The definition covering a parameterization, if one does.
const definitionCovering = param => { const d = definitions.find(x => x.scope.includes(param)); return d ? asWritten(d) : null; };

// The definitions and names as formulas.js takes them.
function engineDefinitions(defs, N, S) {
  return defs.map(d => {
    const v = asWritten(d, S, N);
    const options = v.type === 'choice' ? [...new Set(d.scope.flatMap(p => specsWithParam(p, S)).map(t => t.out.choice))] : undefined;
    const { at, ...rest } = v;
    // A relation's form, by which the engine knows its name and lists: its scope is all of one form.
    const form = v.args && d.scope.length ? formOfParam(d.scope[0], v.type === 'field' ? v.datatype : v.type) : undefined;
    return { ...rest, covers: d.scope, ...(v.args ? { args: v.args.map(a => ({ edge: a.edge })) } : {}), ...(form ? { form } : {}), knownOptions: options };
  });
}
const engineNames = (N, S = schema) => ({ relations: Object.entries(N).map(([form, e]) => ({ name: formName(form, S, N), type: typeOfForm(form), edges: e.edges, form, lists: e.lists ?? {} })) });

// The trees a definition, as people write it, declares: one for each parameterization it covers, with its
// type's output (a choice's, for each option written into it). Locations come from the schema where it has
// them, so they keep its capitalization.
function declaredTrees(v, S) {
  const known = t => S[treeKey(t)] ?? t;
  const outs = v.type === 'tag' ? [{ tag: true }] : v.type === 'choice' ? writtenOptions(v).map(choice => ({ choice })) : [{ field: v.datatype ?? 'number' }];
  let argSets;
  if (v.covers) {
    const edgeOf = edge => v.args ? v.args.find(x => same(x.edge, edge))?.edge ?? edge : v.name;
    argSets = v.covers.map(p => paramArgs(p).map(a => ({ edge: edgeOf(a.edge), loc: S[a.key] })));
    if (argSets.some(args => args.some(a => !a.loc))) return [];
  } else if (v.args) {
    argSets = [[]];
    for (const a of v.args) argSets = argSets.flatMap(set => (a.at ?? []).map(text => [...set, { edge: a.edge, loc: known(locationTree(text)) }]));
  } else argSets = (v.at ?? []).map(text => [{ edge: v.name, loc: known(locationTree(text)) }]);
  return argSets.flatMap(args => outs.map(out => ({ out, args })));
}

// Turns definitions and names into their stored forms, whichever form they come in, and adds to the schema
// what the definitions declare. A definition whose type changed sheds the specifications of its old type
// that no entered record uses (`used`, a set of specification keys). Names come keyed by form, or as a
// list of { name, type, edges, lists }, which is matched to the relations in the schema.
function canonicalFormulas(defs, nms, S, used = new Set()) {
  let N = nms?.relations ? {} : { ...(nms ?? {}) };
  const out = [];
  for (const d of defs) {
    if (d.scope && d.name === undefined) { out.push(d); continue; }
    const scope = Formulas.coversOf(d);
    const trees = declaredTrees(d, S);
    const sorts = new Set(trees.map(sortOf));
    const shed = Object.keys(S).filter(k => scope.includes(treeParam(S[k])) && !sorts.has(sortOf(S[k])) && !used.has(k));
    if (shed.length) { S = { ...S }; shed.forEach(k => delete S[k]); }
    S = withTrees(S, trees);
    const rule = d.implications ? { implications: d.implications } : { formula: d.formula };
    out.push({ id: d.id, scope, ...rule, ...(d.self ? { self: true } : {}) });
    if (d.args && trees[0]) {
      const form = formOfTree(trees[0]);
      N = { ...N, [form]: { lists: {}, ...N[form], name: d.name, edges: d.args.map(a => a.edge) } };
    }
  }
  for (const n of nms?.relations ?? []) {
    const forms = new Set(Object.values(S).filter(t => t.args?.length > 1 && typeOfTree(t) === n.type
      && sameEdges(t.args.map(a => a.edge), n.edges)).map(formOfTree));
    for (const form of forms) N = { ...N, [form]: { name: n.name, edges: n.edges, lists: n.lists ?? {} } };
  }
  return { definitions: out, names: N, schema: S };
}
const sameEdges = (a, b) => a.length === b.length && a.map(norm).sort().join('|') === b.map(norm).sort().join('|');

// The forms the definitions cover, worked out once for each working-out of the formulas, which a change to
// the definitions always brings. A relation of a covered form is computed, though one may be entered too.
const coveredFormsCache = new WeakMap();
function coveredForms() {
  if (!coveredFormsCache.has(formulaResult))
    coveredFormsCache.set(formulaResult, new Set(definitions.flatMap(d => d.scope.flatMap(p => specsWithParam(p).map(formOfTree)))));
  return coveredFormsCache.get(formulaResult);
}
// The definitions covering a form's parameterizations, as people write them.
const definitionsOfForm = form => definitions.filter(d => d.scope.some(p => specsWithParam(p).some(t => formOfTree(t) === form))).map(d => asWritten(d));

// What the formulas say about a record, or null: for a computed record, { def, labels, reads } (its
// definition, the implications that held and what each read); for an entered record that a formula also
// covers, { def, mark, formula, labels }, where mark is 'agrees', 'differs', 'also implied' or 'overrides'.
const formulaInfo = id => formulaResult.computed?.[id] ?? formulaResult.covered?.[id] ?? null;

// Errors the formulas ran into: a definition's own (it doesn't parse, say), and its records'.
const definitionError = defId => formulaResult.defErrors?.[defId] ?? null;
const recordErrors = defId => (formulaResult.errors ?? []).filter(e => e.def === defId);

// Every change to the formulas or the names they use goes through change(), as one undoable step.
// `renames` are [from, to] pairs of names to carry into the views' filters too.
const changeFormulas = (nextDefinitions, nextNames = names, renames = []) => change({ definitions: nextDefinitions, names: nextNames }, { renames });

// A renamed name carried into every formula that mentions it, as Excel carries a renamed defined name into
// its formulas: for a definition or relation renamed, or a list of relatives given a new name.
function renamedInFormulas(defs, from, to) {
  if (!clean(from) || !clean(to) || same(from, to)) return defs;
  const re = text => Formulas.renameName(text, from, to);
  return defs.map(d => ({ ...d,
    ...(d.formula !== undefined ? { formula: re(d.formula) } : {}),
    ...(d.implications ? { implications: d.implications.map(i => ({ ...i, formula: re(i.formula) })) } : {}) }));
}

// The same for the views' filters, as part of the change being made, so its undo takes them back too.
function renameInFilters(renames) {
  const pairs = renames.filter(([from, to]) => clean(from) && clean(to) && !same(from, to));
  if (!pairs.length) return;
  views = currentViews().map(v => v.filter ? { ...v, filter: pairs.reduce((t, [from, to]) => Formulas.renameName(t, from, to), v.filter) } : v);
}

// Adds a definition, or replaces the one with its id; it may come as people write it. Returns why it
// couldn't, if it couldn't. A definition given a new name takes it into the formulas and filters that
// mention the old one.
function saveDefinition(def) {
  const old = definitionOf(def.id);
  const defs = old ? definitions.map(d => d.id === def.id ? def : d) : [...definitions, def];
  if (!old || def.name === undefined || same(old.name, def.name)) return changeFormulas(defs);
  return changeFormulas(renamedInFormulas(defs, old.name, def.name), names, [[old.name, def.name]]);
}
const deleteDefinition = id => changeFormulas(definitions.filter(d => d.id !== id));
const saveNames = next => changeFormulas(definitions, next);

// Drops an entered record that a formula covers, so the formula's output stands there again.
function useFormula(id) {
  const { [id]: _, ...rest } = entered;
  return change({ entered: rest });
}

// Records a computed record's output by hand, like Excel's Paste Values. It keeps its id.
const keepAsEntered = id => commit({ ...records, [id]: modelPart(records[id]) });

// ---- Names ----
// The names of relations and of their lists of relatives, by form: { [form]: { name, edges, lists } },
// with `edges` in the relation's own order and `lists` as { [from edge]: { [listed edge]: list name } }
// (edges normalized). A list without a name goes by the edge label it lists.

const typeOfForm = form => { const s = JSON.parse(form)[0]; return s === 'tag' || s === 'choice' ? s : 'field'; };

// A relation form's name: the one in the names, or for want of one, its edge labels in order. This is the
// one way a relation is named, wherever it's shown.
function formName(form, S = schema, N = names) {
  if (N[form]?.name) return N[form].name;
  return (N[form]?.edges ?? specsOfForm(form, S)[0]?.args.map(a => a.edge) ?? []).join(' · ');
}
// A relation record's name, from its form.
function relationNameOf(id) {
  const t = treeOf(records, id);
  return t ? formName(formOfTree(t)) : relationLabel(records[id]);
}

// The name of the list of relatives in the `listed` role, seen from the `from` role, for a relation form:
// its list name, or for want of one, the listed role's edge label, as formulas.js reads it too.
function listName(form, from, listed, N = names) {
  const lists = Object.entries(N[form]?.lists ?? {}).find(([k]) => same(k, from))?.[1];
  return Object.entries(lists ?? {}).find(([k]) => same(k, listed))?.[1] ?? listed;
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
// How a record is named in UI text: an entry by its label, a relation by its name (see formName).
const recordLabel = id => isRelation(records[id]) ? relationNameOf(id) : records[id].edge;

const TYPE_NAMES = { field: 'Field', tag: 'Tag', choice: 'Choice' };
const DATATYPE_NAMES = { text: 'Text', number: 'Number', percent: 'Percent', money: 'Money', date: 'Date' };
// What a value box for each datatype asks for.
const VALUE_HINTS = { text: 'Value', number: 'Amount', percent: 'Percent, like 25%', money: 'Amount, like $1,000', date: 'Date' };

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

// A field's value is canonical for its datatype, whether typed or computed: text is a string; a number, a
// percentage and an amount of money are numbers (a percentage as a fraction, 0.716 for 71.6%); a date is
// an ISO date, 2023-02-14. How a value reads, and how typing reads, follow from its datatype.

// Amounts as typed: 1,000, $750,000,000 or 12.5%. A leading zero (0803456789) marks an identifier: text.
const NUMBER = /^[-+]?\$?(\d{1,3}(,\d{3})+|\d+)(\.\d+)?%?$/;
const isNumber = s => NUMBER.test(s) && !/^[-+]?\$?0\d/.test(s);

// The datatype something typed reads as, where nothing else says.
const classify = s => parseDate(s) ? 'date' : !isNumber(s) ? 'text' : s.endsWith('%') ? 'percent' : /^[-+]?\$/.test(s) ? 'money' : 'number';
const asPhrase = datatype => ({ text: 'text', number: 'a number', percent: 'a percentage', money: 'an amount of money', date: 'a date' })[datatype];

// What's typed as a value of a datatype, or undefined if it isn't one. In a percentage, a bare number is
// a percentage too: 25 is 25%.
function parseValue(datatype, raw) {
  const s = clean(raw);
  if (!s) return undefined;
  if (datatype === 'date') return parseDate(s) ?? undefined;
  if (datatype === 'text') return s;
  if (!isNumber(s) || (datatype !== 'percent' && s.endsWith('%'))) return undefined;
  const n = Number(s.replace(/[$,%]/g, ''));
  return datatype === 'percent' ? n / 100 : n;
}

// How a value of a datatype reads: 71.6%, $750,000,000, 1,000, February 14, 2023.
function showValue(datatype, v) {
  if (v === null || v === undefined) return '';
  if (datatype === 'date') return formatDate(v);
  if (typeof v !== 'number') return String(v);
  const n = (x, min = 0) => x.toLocaleString('en-US', { minimumFractionDigits: min, maximumFractionDigits: 2 });
  if (datatype === 'percent') return `${n(v * 100)}%`;
  if (datatype === 'money') return `${v < 0 ? '-' : ''}$${n(Math.abs(v), Number.isInteger(v) ? 0 : 2)}`;
  return n(v);
}
const displayValue = r => showValue(r.field, r.value);

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

// The kinds in the schema, each as first written.
const kindsInState = () => Object.values(schema).filter(t => t.kind !== undefined).map(t => t.kind).sort(byLabel);

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

// ---- The schema ----
// A chart keeps its schema S explicitly, as data-model.md has it. `schema` maps each specification's key
// (as specKey gives it) to the specification as a tree, capitalized as it was first written:
//   a kind:                  { kind: 'Entity' }
//   an entry or a relation:  { out: { field: datatype } | { choice: option } | { tag: Boolean }, args: [{ edge, loc }] }
// each `loc` being its location's own tree. S holds the specification of every record, entered or computed,
// and every location of every specification in it. It grows as records come in. A specification leaves it
// only by moving (see moveAbandoned and renameEvery), by being shed when a formula's type changes, by
// giving way to records that conflict with it while unused, or by being removed in the panel's Schema view.

const outOf = r => isField(r) ? { field: r.field } : isChoice(r) ? { choice: r.choice } : { tag: r.tag };
const outKey = out => 'field' in out ? `field:${out.field}` : 'choice' in out ? `choice:${norm(out.choice)}` : `tag:${out.tag}`;
const typeOfTree = t => t.kind !== undefined ? 'object' : 'field' in t.out ? 'field' : 'choice' in t.out ? 'choice' : 'tag';
const argKeysOf = (t, keyOf) => t.args.map(a => JSON.stringify([norm(a.edge), keyOf(a.loc)])).sort();

// A tree's key, as specKey gives it, and its parameterization's key, as parameterization gives it.
const keyMemo = new WeakMap();
function treeKey(t) {
  if (!keyMemo.has(t)) keyMemo.set(t, t.kind !== undefined ? `kind:${norm(t.kind)}` : JSON.stringify([outKey(t.out), ...argKeysOf(t, treeKey)]));
  return keyMemo.get(t);
}
const treeParam = t => t.kind !== undefined ? '[]' : JSON.stringify(argKeysOf(t, treeKey));

// A tree's shape is the tree with every node label erased and its edge labels kept; its sort, what kind
// of output it has: a field's datatype, 'choice', 'tag', or 'object' for a kind. A specification's form is
// its shape with its sort. Ownership of an Entity by an Individual and by an Investor Group have one form;
// so do Tax Classification under each Entity Type, and the Name of anything.
const shapeMemo = new WeakMap(), formMemo = new WeakMap();
function shapeOf(t) {
  if (!shapeMemo.has(t)) shapeMemo.set(t, t.kind !== undefined ? '•' : JSON.stringify(['∘', ...argKeysOf(t, shapeOf)]));
  return shapeMemo.get(t);
}
const sortOf = t => t.kind !== undefined ? 'object' : 'field' in t.out ? t.out.field : 'choice' in t.out ? 'choice' : 'tag';
function formOfTree(t) {
  if (!formMemo.has(t)) formMemo.set(t, t.kind !== undefined ? 'object' : JSON.stringify([sortOf(t), ...argKeysOf(t, shapeOf)]));
  return formMemo.get(t);
}

// The same from keys alone, with no trees: a specification key's shape, and a parameterization's form
// given its sort.
function shapeOfKey(key) {
  if (key.startsWith('kind:')) return '•';
  const [, ...args] = JSON.parse(key);
  return JSON.stringify(['∘', ...args.map(a => { const [e, k] = JSON.parse(a); return JSON.stringify([e, shapeOfKey(k)]); }).sort()]);
}
const formOfParam = (param, sort) => param === '[]' ? 'object'
  : JSON.stringify([sort, ...JSON.parse(param).map(a => { const [e, k] = JSON.parse(a); return JSON.stringify([e, shapeOfKey(k)]); }).sort()]);

// A record's specification as a tree, built from the records, or null where a location is missing.
const treeCache = new WeakMap();
function treeOf(recs, id) {
  if (!treeCache.has(recs)) treeCache.set(recs, new Map());
  const cache = treeCache.get(recs);
  if (!cache.has(id)) {
    const r = recs[id];
    let t = null;
    if (r && isObject(r)) t = { kind: r.kind };
    else if (r) {
      const args = argsOf(r).map(a => ({ edge: a.edge, loc: treeOf(recs, a.at) }));
      if (args.every(a => a.loc)) t = { out: outOf(r), args };
    }
    cache.set(id, t);
  }
  return cache.get(id);
}
// A record's form.
const formKeyOf = (id, recs = records) => { const t = treeOf(recs, id); return t ? formOfTree(t) : null; };

// S with trees added, and their locations: those it has already keep their capitalization.
function withTrees(S, trees) {
  let out = S;
  const add = t => {
    const k = treeKey(t);
    if (out[k]) return;
    if (out === S) out = { ...S };
    out[k] = t;
    t.args?.forEach(a => add(a.loc));
  };
  trees.forEach(t => t && add(t));
  return out;
}
const withSpecsOf = (S, recs) => withTrees(S, Object.keys(recs).map(id => treeOf(recs, id)));

// What the schema says, worked out once for each schema: its specifications by parameterization and by
// form, and the entries and relations of each location specification.
const pushTo = (map, key, v) => { if (!map.has(key)) map.set(key, []); map.get(key).push(v); };
const schemaIndexes = new WeakMap();
function indexOf(S = schema) {
  if (!schemaIndexes.has(S)) {
    const ix = { byParam: new Map(), byForm: new Map(), entriesAt: new Map(), relationsAt: new Map(), kinds: [] };
    for (const [k, t] of Object.entries(S)) {
      pushTo(ix.byParam, treeParam(t), k);
      pushTo(ix.byForm, formOfTree(t), k);
      if (!t.args) ix.kinds.push(k);
      else if (t.args.length === 1) pushTo(ix.entriesAt, treeKey(t.args[0].loc), k);
      else for (const loc of new Set(t.args.map(a => treeKey(a.loc)))) pushTo(ix.relationsAt, loc, k);
    }
    schemaIndexes.set(S, ix);
  }
  return schemaIndexes.get(S);
}
const specsWithParam = (p, S = schema) => (indexOf(S).byParam.get(p) ?? []).map(k => S[k]);
const specsOfForm = (f, S = schema) => (indexOf(S).byForm.get(f) ?? []).map(k => S[k]);
const formsOfSchema = (S = schema) => [...indexOf(S).byForm.keys()];

// The outputs a form has in the schema, as [key, text] pairs, keyed as outputKey keys records: kinds,
// options, attested and ruled out, or a datatype.
function formOutputs(f, S = schema) {
  const out = new Map();
  for (const t of specsOfForm(f, S)) {
    const [key, text] = treeOutput(t);
    if (!out.has(key)) out.set(key, text);
  }
  return [...out];
}
// A specification's output, as [key, text]: the key as outputKey gives a record's, the text as outputText.
const treeOutput = t => t.kind !== undefined ? [norm(t.kind), t.kind] : 'choice' in t.out ? [norm(t.out.choice), t.out.choice]
  : 'tag' in t.out ? [String(t.out.tag), t.out.tag ? 'Attested' : 'Ruled out'] : [t.out.field, DATATYPE_NAMES[t.out.field]];

// How many records have each specification, and which: worked out once for each set of records.
const usageCache = new WeakMap();
function usage(recs = records) {
  if (!usageCache.has(recs)) {
    const u = new Map();
    for (const id of Object.keys(recs)) { const t = treeOf(recs, id); if (t) pushTo(u, treeKey(t), id); }
    usageCache.set(recs, u);
  }
  return usageCache.get(recs);
}

// A form described for people: what it's called (an entry's label, a relation's name or edges) and where
// it is (the kinds and paths of its locations).
function describeForm(f, S = schema) {
  if (f === 'object') return { label: 'Kind', where: 'every object' };
  const trees = specsOfForm(f, S);
  const t = trees[0];
  if (!t) return { label: 'Nothing in the chart', where: '' };
  const locsOf = arg => trees.map(x => x.args.find(a => same(a.edge, arg.edge))?.loc).filter(Boolean);
  const kindsOf = arg => [...new Set(locsOf(arg).map(kindOfTree).filter(Boolean))];
  if (t.args.length > 1) return { label: formName(f, S), where: t.args.map(a => joinList(kindsOf(a), 'or')).join(' → ') };
  const top = t.args[0].loc.kind !== undefined;
  const places = top ? kindsOf(t.args[0]).map(plural) : [...new Set(locsOf(t.args[0]).map(placeText))];
  return { label: t.args[0].edge, where: top ? `on ${joinList(places)}` : `under ${joinList(places, 'or')}` };
}
// The kind a location belongs to: the kind at the end of its path, if it's a path.
const kindOfTree = t => t.kind ?? (t.args.length === 1 ? kindOfTree(t.args[0].loc) : null);
// A location as a description reads it: a kind, a path from one, or a relation and what it relates.
function placeText(loc) {
  if (loc.kind !== undefined) return loc.kind;
  if (loc.args.length > 1) return formName(formOfTree(loc));
  return pathText(loc) ?? `${placeText(loc.args[0].loc)} › ${loc.args[0].edge}`;
}
// Where a record's entries sit, as headings say it: "on Entities", or "under Entity › Jurisdiction:
// Delaware", "under Ownership".
function whereAt(id) {
  const t = treeOf(records, id);
  if (!t) return '';
  return t.kind !== undefined ? `on ${plural(t.kind)}` : `under ${placeText(t)}`;
}
// The name of what a record belongs to: its object's name, or the relation it's located at (or below).
const placeName = id => segmentText(pathTo(id)[0]);
const joinList = (items, word = 'and') => items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} ${word} ${items.at(-1)}`;

// The first way S fails the schema conditions: no two fields, or a field and a tag, or a choice and either,
// may share a parameterization. Null if it doesn't.
function schemaError(S) {
  for (const [p, keys] of indexOf(S).byParam) {
    if (p === '[]') continue;
    const trees = keys.map(k => S[k]);
    const label = trees[0].args.map(a => a.edge).join(' · ');
    const types = new Set(trees.map(typeOfTree));
    const datatypes = [...new Set(trees.filter(t => 'field' in t.out).map(t => t.out.field))];
    if (datatypes.length > 1) return `${label} can’t be both a ${datatypes[0]} field and a ${datatypes[1]} field.`;
    if (types.has('choice') && types.size > 1) return `${label} can’t be both a choice and a ${types.has('tag') ? 'tag' : 'field'}.`;
    if (types.has('tag') && types.has('field')) return `${label} can’t be both a tag and a field.`;
  }
  return null;
}

// S less the unused specifications that conflict with ones in use: records win over what nothing has.
// A specification is in use if a record has it, a record sits below it, or a formula covers it.
function settleConflicts(S, recs, defs) {
  const used = new Set(usage(recs).keys());
  for (const k of [...used]) for (const loc of locationsBelow(S[k])) used.add(treeKey(loc));
  const covered = new Set(defs.flatMap(d => d.scope));
  let out = S;
  for (const keys of indexOf(S).byParam.values()) {
    const trees = keys.map(k => S[k]);
    if (trees.length < 2 || !trees.some(t => t.args)) continue;
    const kept = keys.filter(k => used.has(k) || covered.has(treeParam(S[k])));
    const sorts = new Set(kept.map(k => sortOf(S[k])));
    const types = new Set(kept.map(k => typeOfTree(S[k])));
    for (const k of keys) {
      if (kept.includes(k) || (sorts.has(sortOf(S[k])) && types.size <= 1) || !sorts.size) continue;
      if (out === S) out = { ...S };
      delete out[k];
    }
  }
  return out;
}
const locationsBelow = t => t?.args ? t.args.flatMap(a => [a.loc, ...locationsBelow(a.loc)]) : [];

// ---- What the schema offers ----

// The fields that relations like this one have located at them in the schema, as { label, datatype }:
// relations of the same form and output, whatever kinds their sides are, so ownership by a new kind of
// owner is offered a Percentage too. A ruled-out tag has none.
function detailFieldsOf(id) {
  const r = records[id];
  if (isTag(r) && !r.tag) return [];
  const t = treeOf(records, id);
  if (!t) return [];
  const fields = new Map();
  for (const s of Object.values(schema)) {
    if (s.args?.length !== 1 || !('field' in s.out)) continue;
    const loc = s.args[0].loc;
    if (loc.args?.length > 1 && formOfTree(loc) === formOfTree(t) && outKey(loc.out) === outKey(t.out) && !fields.has(norm(s.args[0].edge)))
      fields.set(norm(s.args[0].edge), { label: s.args[0].edge, datatype: s.out.field });
  }
  return [...fields.values()];
}

// Relations with an argument at `id`.
const relationsAt = (id, recs = records) =>
  Object.keys(recs).filter(k => isRelation(recs[k]) && recs[k].args.some(a => a.at === id));
const hasEntries = id => entriesOf(id).length > 0 || relationsAt(id).length > 0;

// Every record whose path starts at the object, the object included.
const recordsUnder = obj => Object.keys(records).filter(k => !isRelation(records[k]) && objectOf(k) === obj);

// How a record reads as one segment of a path. A relation reads as its name.
function segmentText(id) {
  const r = records[id];
  if (isObject(r)) return objectName(id);
  if (isRelation(r)) return relationNameOf(id);
  if (isTag(r)) return `${r.tag ? '' : 'Not '}${r.edge}`;
  return isChoice(r) ? `${r.edge}: ${r.choice}` : r.edge;
}

// The options a choice has in the schema, for its dropdown: the outputs of its parameterization.
const outputsOf = id => [...new Set(specsWithParam(parameterization(records, id)).filter(t => 'choice' in t.out).map(t => t.out.choice))].sort(byLabel);

// A relation seen from a location, as the panel groups it: its form, and the split of its edges into the
// location's own and the others'. Relations of one form, seen from the same role, share a row there, and
// adding another to the row starts from the same key.
const relationRowKey = (form, own, others) => JSON.stringify([form, own.map(norm).sort(), others.map(norm).sort()]);

// The relations at a location, grouped into the rows that show them there, by form and role. A row is
// labeled with its list name: the list of relatives in the other role, seen from this one (Owners).
function relationGroups(at) {
  const groups = new Map();
  for (const id of relationsAt(at)) {
    const r = records[id];
    const form = formKeyOf(id);
    const own = r.args.filter(a => a.at === at).map(a => a.edge);
    const others = r.args.filter(a => a.at !== at).map(a => a.edge);
    const key = relationRowKey(form, own, others);
    if (!groups.has(key)) groups.set(key, { key, form, type: typeOf(r), own, others, ids: [],
      list: others.length ? listName(form, own[0], others[0]) : own.join(' · ') });
    groups.get(key).ids.push(id);
  }
  return [...groups.values()].sort((a, b) => byLabel(a.list, b.list));
}

// The two-argument relations in the schema that a location like `at` takes part in: one per form and role
// this location would have, with every specification on the other side. Each carries its relation's name,
// the list it adds to here (Owners), and whether a definition covers its form, in which case adding one
// attests it by hand.
function relationTypesAt(at) {
  const spec = specKey(records, at);
  const types = new Map();
  for (const k of indexOf().relationsAt.get(spec) ?? []) {
    const t = schema[k];
    if (t.args.length !== 2) continue;
    const form = formOfTree(t);
    t.args.forEach((own, i) => {
      if (treeKey(own.loc) !== spec) return;
      const other = t.args[1 - i];
      const type = typeOfTree(t);
      const key = relationRowKey(form, [own.edge], [other.edge]);
      if (!types.has(key)) types.set(key, { key, form, type, own: own.edge, other: other.edge, ownFirst: i === 0, otherSpecs: new Set(),
        datatype: t.out.field, outputs: [], name: formName(form), list: listName(form, own.edge, other.edge), computed: coveredForms().has(form) });
      const rel = types.get(key);
      rel.otherSpecs.add(treeKey(other.loc));
      if (type === 'choice' && !rel.outputs.some(o => same(o, t.out.choice))) rel.outputs.push(t.out.choice);
    });
  }
  return [...types.values()].sort((a, b) => a.computed - b.computed || byLabel(a.list, b.list));
}

// The entries the schema has for locations like `at` (with its specification), one per type and label,
// with each field's datatype and each choice's options. `exceptId` leaves out what only that record has, so
// an entry being edited isn't held to its own datatype.
function schemaAt(at, exceptId) {
  const loc = specKey(records, at);
  const used = usage();
  const params = new Map();
  for (const k of indexOf().entriesAt.get(loc) ?? []) {
    const users = used.get(k) ?? [];
    if (exceptId && users.length === 1 && users[0] === exceptId) continue;
    const t = schema[k];
    const type = typeOfTree(t);
    const key = `${type}:${norm(t.args[0].edge)}`;
    if (!params.has(key)) params.set(key, { type, label: t.args[0].edge, datatype: t.out.field, outputs: [] });
    const p = params.get(key);
    if (type === 'choice' && !p.outputs.some(o => same(o, t.out.choice))) p.outputs.push(t.out.choice);
  }
  return [...params.values()];
}

// The datatype other fields with this label already have at locations like `at`, if any.
const fieldDatatype = (at, label, exceptId) =>
  schemaAt(at, exceptId).find(p => p.type === 'field' && same(p.label, label))?.datatype;

// Returns a message for the first way `recs` fails to be a state, or null if it is one. The schema
// conditions are checked on the schema itself (schemaError).
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
  return null;
}

// The first way the definitions fail the model's conditions (model.html 7.7), or null: each covers a
// nonempty set of parameterizations, all of one form, and no two cover the same parameterization.
function definitionsError(defs, S, N) {
  const coveredBy = new Map();
  for (const d of defs) {
    const name = asWritten(d, S, N).name;
    if (!d.scope.length) return `${name} doesn’t cover anything.`;
    const forms = new Set(d.scope.flatMap(p => specsWithParam(p, S).map(formOfTree)));
    if (forms.size > 1) return `${name} covers things of different forms; a definition covers one form.`;
    for (const p of d.scope) {
      if (coveredBy.has(p)) return `${coveredBy.get(p)} already covers part of what ${name} covers.`;
      coveredBy.set(p, name);
    }
  }
  return null;
}

// ---- Changing the state ----

// The one way a chart changes, as one undoable step: its entered records, formulas, names or schema
// replaced at once (`next` gives whichever change). The formulas are worked out again, and the schema
// takes in the specifications the records now have. Options:
// - moves: for an edit made one record at a time (renaming here only, moving up a level), the abandonment
//   law applies; see moveAbandoned;
// - maps: keys already moved with the schema (renaming every one like it) carry over to what's keyed by them;
// - renames: [from, to] pairs of names to carry into the views' filters;
// - after: anything else to change in the same step, once the rest has.
// Returns why not, if the result isn't a state.
function change(next, { moves = false, maps = null, renames = [], after = null } = {}) {
  const nextEntered = next.entered ?? entered;
  const used = new Set(usage(nextEntered).keys());
  let { definitions: defs, names: nms, schema: S } = canonicalFormulas(next.definitions ?? definitions, next.names ?? names, next.schema ?? schema, used);
  if (maps) { defs = mapScopes(defs, maps); nms = mapNames(nms, maps); }
  // Definitions that don't fit the model aren't worth working out.
  const malformed = definitionsError(defs, S, nms);
  if (malformed) return malformed;
  let result = runFormulas(nextEntered, defs, nms, S);
  S = withSpecsOf(S, result.records);
  let moved = null;
  if (moves) {
    ({ schema: S, maps: moved } = moveAbandoned(S, records, result.records));
    if (moved) {
      nms = mapNames(nms, moved);
      const mapped = mapScopes(defs, moved);
      if (mapped !== defs) {
        defs = mapped;
        result = runFormulas(nextEntered, defs, nms, S);
        S = withSpecsOf(S, result.records);
      }
    }
  }
  S = settleConflicts(S, result.records, defs);
  const error = validate(result.records) ?? schemaError(S) ?? (moved ? definitionsError(defs, S, nms) : null);
  if (error) return error;
  pushUndo();
  entered = nextEntered;
  definitions = defs;
  names = nms;
  schema = S;
  setComputed(result);
  for (const m of [maps, moved]) if (m) remapPresentation(m);
  renameInFilters(renames);
  after?.();
  saveState();
  return null;
}

// Replaces the records, if the result is a state; otherwise returns why not. `next` is what `records`
// should become; its entered part is kept, and the formulas worked out again. See change for `opts`.
const commit = (next, opts = {}) => change({ entered: enteredPart(next) }, opts);

// A schema rewritten tree by tree, from the locations up, with what it says about moved keys (keyMapsOf).
// `subst` maps a specification's key to the tree that replaces it outright; `relabel(tree, original)`
// relabels a tree once its locations are rewritten. A tree that lands on a key the schema has keeps that.
function rewriteSchema(S, { subst = null, relabel = null }) {
  const memo = new Map();
  const rewrite = t => {
    const k = treeKey(t);
    if (memo.has(k)) return memo.get(k);
    let out = subst?.get(k);
    if (!out) {
      const args = t.args?.map(a => ({ edge: a.edge, loc: rewrite(a.loc) }));
      out = args && args.some((a, i) => a.loc !== t.args[i].loc) ? { ...t, args } : t;
      if (relabel) out = relabel(out, t);
    }
    memo.set(k, out);
    return out;
  };
  const next = {}, pairs = [];
  for (const [k, t] of Object.entries(S)) {
    const t1 = rewrite(t);
    const k1 = treeKey(t1);
    next[k1] ??= t1;
    if (k1 !== k) pairs.push([t, t1]);
  }
  return { schema: next, maps: pairs.length ? keyMapsOf(pairs, next) : null };
}

// Which keys moved: for each specification replaced, its key, its parameterization's and its form's, the
// last two only where the new schema has nothing left with the old one.
function keyMapsOf(pairs, S) {
  const ix = indexOf(S);
  const specs = new Map(), params = new Map(), forms = new Map();
  for (const [t0, t1] of pairs) {
    specs.set(treeKey(t0), treeKey(t1));
    const p0 = treeParam(t0), p1 = treeParam(t1);
    if (p0 !== p1 && !ix.byParam.has(p0)) params.set(p0, p1);
    const f0 = formOfTree(t0), f1 = formOfTree(t1);
    if (f0 !== f1 && !ix.byForm.has(f0)) forms.set(f0, f1);
  }
  return { specs, params, forms };
}

// The abandonment law. After an edit made one record at a time, a specification that the edited records
// left, and that no record has any more, moves with them: in the schema it's replaced by the one they have
// now, along with whatever is located at it, and what was keyed by it follows (see remapPresentation).
function moveAbandoned(S, before, after) {
  const used = usage(after);
  const subst = new Map();
  for (const id of Object.keys(after)) {
    if (!before[id]) continue;
    const t0 = treeOf(before, id), t1 = treeOf(after, id);
    if (!t0 || !t1) continue;
    const k0 = treeKey(t0);
    if (k0 !== treeKey(t1) && !used.has(k0) && S[k0]) subst.set(k0, t1);
  }
  return subst.size ? rewriteSchema(S, { subst }) : { schema: S, maps: null };
}

// What's keyed by a moved key follows it, unless something already has the new key: definitions' scopes
// and required entries by parameterization; names and every view's styles by form; entry order by
// location specification.
const mapScopes = (defs, maps) => maps.params.size
  ? defs.map(d => d.scope.some(p => maps.params.has(p)) ? { ...d, scope: [...new Set(d.scope.map(p => maps.params.get(p) ?? p))] } : d) : defs;
function mapNames(N, maps) {
  let out = N;
  for (const [f0, f1] of maps.forms) if (out[f0] && !out[f1]) { const { [f0]: n, ...rest } = out; out = { ...rest, [f1]: n }; }
  return out;
}
function remapPresentation(maps) {
  for (const [s0, s1] of maps.specs) if (order[s0] && !order[s1]) { const { [s0]: list, ...rest } = order; order = { ...rest, [s1]: list }; }
  required = [...new Set(required.map(p => maps.params.get(p) ?? p))];
  const restyle = list => [...maps.forms].reduce((acc, [f0, f1]) =>
    acc.some(s => s.form === f1) ? acc : acc.map(s => s.form === f0 ? { ...s, form: f1 } : s), list);
  views = currentViews().map(v => ({ ...v, styles: restyle(v.styles) }));
  styles = viewInUse().styles;
}

// ---- Renaming ----

// A record, or a tree, with one of its edges relabeled: an entry's label, or one of a relation's edges.
const relabelRecord = (r, from, to) => r.args ? { ...r, args: r.args.map(a => same(a.edge, from) ? { ...a, edge: to } : a) }
  : same(r.edge, from) ? { ...r, edge: to } : r;
const relabelTree = (t, from, to) => ({ ...t, args: t.args.map(a => same(a.edge, from) ? { ...a, edge: to } : a) });

// The entered records like this one, itself included: those of its form, which a rename of every one like
// it reaches. Computed ones follow their definition instead.
const likeRecords = id => { const f = formKeyOf(id); return Object.keys(entered).filter(k => formKeyOf(k) === f); };

// Renames a label on every entered record of a record's form, and on the schema's specifications of that
// form, so the vocabulary itself changes: an entry's label, or one of a relation's edges. What's keyed by
// the specifications follows, and so do the names and entry order that use the label, and, once no
// entered record has the old label, the formulas and filters that mention it. `extra` are other changes to
// records in the same step, such as the rest of an edit form. Returns why it couldn't, if it couldn't.
function renameEvery(id, from, to, extra = {}) {
  const form = formKeyOf(id);
  const { schema: S, maps } = rewriteSchema(schema, { relabel: (t, orig) => formOfTree(orig) === form ? relabelTree(t, from, to) : t });
  const next = { ...entered };
  for (const k of likeRecords(id)) next[k] = relabelRecord(entered[k], from, to);
  for (const [k, r] of Object.entries(extra)) next[k] = r;
  const gone = !Object.values(next).some(r => (!r.args && same(r.edge, from)) || r.args?.some(a => same(a.edge, from)));
  const defs = gone ? renamedInFormulas(definitions, from, to) : definitions;
  const swap = e => same(e, from) ? to : e;
  const swapKeys = o => Object.fromEntries(Object.entries(o ?? {}).map(([k, v]) => [same(k, from) ? norm(to) : k, v]));
  const nms = names[form] ? { ...names, [form]: { ...names[form], edges: names[form].edges.map(swap),
    lists: Object.fromEntries(Object.entries(swapKeys(names[form].lists)).map(([k, v]) => [k, swapKeys(v)])) } } : names;
  const newForm = maps?.forms.get(form) ?? form;
  const locs = new Set(specsOfForm(newForm, S).filter(t => t.args.length === 1).map(t => treeKey(t.args[0].loc)));
  const relabelOrder = () => {
    order = Object.fromEntries(Object.entries(order).map(([k, list]) => [k, locs.has(k) ? list.map(l => l === norm(from) ? norm(to) : l) : list]));
  };
  return change({ entered: next, schema: S, definitions: defs, names: nms }, { maps: maps ?? undefined, renames: gone ? [[from, to]] : [], after: relabelOrder });
}

// Relabels a relation's edge, here only or on every relation like it (renameEvery).
const renameEdge = (id, from, to, every) => every ? renameEvery(id, from, to)
  : commit({ ...records, [id]: relabelRecord(records[id], from, to) }, { moves: true });

// ---- Arranging and editing entries ----

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

// Saves a field's value typed in place. Its datatype is the one the schema has for its parameterization,
// or else a guess from what's typed. Returns why it couldn't be saved, if it couldn't. A value left as it
// was isn't a change, so a computed one isn't overridden by it.
function saveFieldValue(id, raw, label = recordLabel(id)) {
  const r = records[id];
  const datatype = specsWithParam(parameterization(records, id)).find(t => 'field' in t.out && !onlyHas(t, id))?.out.field
    ?? (isObjectName(id) ? 'text' : classify(clean(raw)));
  const value = parseValue(datatype, raw);
  if (value === undefined) return clean(raw) ? `${label} takes ${asPhrase(datatype)} here.` : `${label} can’t be empty.`;
  if (datatype === r.field && value === r.value) return null;
  return commit({ ...records, [id]: { ...r, field: datatype, value } });
}
// Whether a specification is had by this record alone, so that changing the record may change it.
const onlyHas = (t, id) => { const users = usage().get(treeKey(t)) ?? []; return users.length === 1 && users[0] === id; };

// Adds a field typed in place at a location, such as a Percentage at a new ownership. Its datatype is the
// schema's for its label there, or else `datatype`, or else a guess from the value. Nothing typed adds
// nothing. Returns why it couldn't be added, if it couldn't.
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
// since they're located at it, and so, by the abandonment law, does its specification if nothing else
// has it. Returns why it couldn't, if it couldn't.
function moveUp(id) {
  const r = records[id];
  const loc = records[r.at];
  if (!loc || isObject(loc) || isRelation(loc)) return `${r.edge} is already at the top level.`;
  return commit({ ...records, [id]: { ...r, at: loc.at } }, { moves: true });
}

// ---- Required entries ----
// `required` lists the parameterizations every location like theirs should have an entry for.

// The parameterization an entry labeled `label` would have at a location.
const paramAt = (label, at) => JSON.stringify([JSON.stringify([norm(label), specKey(records, at)])]);
const isRequired = param => required.includes(param);

// A required parameterization as the panel shows it blank: its label, type and datatype, from the schema.
function requiredInfo(param) {
  const t = specsWithParam(param)[0];
  return t ? { label: t.args[0].edge, type: typeOfTree(t), datatype: t.out.field } : null;
}

// Requires a parameterization at every location like its own, or stops requiring it, as one undoable step.
// Only an entry's parameterization, with one location, can be required.
function setRequired(param, on) {
  if (isRequired(param) === on || (on && paramArgs(param).length !== 1)) return;
  pushUndo();
  required = on ? [...required, param] : required.filter(x => x !== param);
  saveState();
}
const toggleRequired = id => { const p = parameterization(records, id); setRequired(p, !isRequired(p)); };
const stopRequiring = param => setRequired(param, false);

// The required entries a location has no entry for, as [param, { label, type, datatype }] pairs.
// A tag counts as recorded whether it's attested or ruled out.
function missingAt(at) {
  if (!records[at] || isField(records[at])) return [];
  const loc = specKey(records, at);
  return required.filter(p => paramArgs(p).length === 1 && paramArgs(p)[0].key === loc && requiredInfo(p)
    && !entriesOf(at).some(e => parameterization(records, e) === p)).map(p => [p, requiredInfo(p)]);
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
// with it. The schema keeps their specifications, and every view keeps their box positions, so a restored
// record returns as it was.
function deleteRecords(ids, label) {
  const gone = withDependents(ids);
  const kept = Object.fromEntries([...gone].filter(k => entered[k]).map(k => [k, entered[k]]));
  const nextEntered = Object.fromEntries(Object.entries(entered).filter(([k]) => !gone.has(k)));
  return change({ entered: nextEntered }, { after: () => { archive = [{ id: newId(), label, when: Date.now(), records: kept }, ...archive]; } });
}

// Puts a deleted batch back. Something it depends on may have been deleted since, in which case that
// needs restoring first.
function restoreBatch(batchId) {
  const batch = archive.find(b => b.id === batchId);
  const there = { ...records, ...batch.records };
  const missing = Object.values(batch.records).flatMap(argsOf).map(a => a.at).find(at => !there[at]);
  if (missing) {
    const other = archive.find(b => b.records[missing]);
    return other ? `Restore ${other.label} first; this depends on it.` : 'Something this depends on no longer exists.';
  }
  const error = change({ entered: { ...entered, ...batch.records } }, { after: () => { archive = archive.filter(b => b !== batch); } });
  return error ? `Can’t restore it: ${error}` : null;
}

// ---- Removing from the schema ----

// The specifications nothing has: no record, no specification located at them, no formula's scope, no
// required entry. They can be removed from the schema, as the panel's Schema view offers.
function unusedSpecs() {
  const used = new Set(usage().keys());
  for (const k of [...used]) for (const loc of locationsBelow(schema[k])) used.add(treeKey(loc));
  for (const t of Object.values(schema)) for (const loc of locationsBelow(t)) used.add(treeKey(loc));
  const covered = new Set([...definitions.flatMap(d => d.scope), ...required]);
  return Object.keys(schema).filter(k => !used.has(k) && !covered.has(treeParam(schema[k])));
}

// Removes unused specifications from the schema, as one undoable step.
function removeSpecs(keys) {
  const gone = new Set(keys.filter(k => unusedSpecs().includes(k)));
  if (!gone.size) return null;
  return change({ schema: Object.fromEntries(Object.entries(schema).filter(([k]) => !gone.has(k))) });
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

// Commits records and the formulas together, as one undoable step: for a formula typed into a value box,
// which replaces that value with the formula's output. `next` is what `records` should become, as for
// commit(). `renames` are [from, to] pairs to carry into the views' filters too.
const commitWithFormulas = (next, nextDefinitions, nextNames = names, renames = []) =>
  change({ entered: enteredPart(next), definitions: nextDefinitions, names: nextNames }, { renames });

// ---- View filters ----

// What a view shows besides its styles and the things hidden one by one: a filter, a condition worked out
// at each object, which shows the boxes it holds for. It's kept on the view, like its hidden list, so its
// copies and undo take it along.
const viewFilter = () => viewInUse().filter ?? '';

function setViewFilter(text) {
  pushUndo();
  views = currentViews().map(v => v.id === viewId ? { ...v, filter: String(text ?? '').trim() } : v);
  saveState();
}
