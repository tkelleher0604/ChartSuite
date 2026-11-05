// A company structure: entities, the individuals behind them, who owns what by how much, and their directors and officers; and what a jurisdiction asks
// of each, its Delaware tax, its file number, its good standing and its documents on file, with the arithmetic any ownership answers to. None of it fund law.
Templates.register({
  id: 'company',
  name: 'Company structure',
  order: 4,
  rows: Templates.rows(t => {
    const entity = { kind: 'Entity' }, individual = { kind: 'Individual' }, field = (edge, type = 'text') => ({ out: { field: type }, ...t.entry(edge, {}) });
    const type = choice => ({ out: { choice }, ...t.entry('Entity Type', {}) });
    t.kind('Entity', {
      Name: 'text',
      'Entity Type': ['Corporation', 'Limited Liability Company', 'Limited Partnership', 'General Partnership', 'Trust', 'Branch'],
      Jurisdiction: ['Alabama', 'Alaska', 'Arizona', 'Arkansas', 'California', 'Colorado', 'Connecticut', 'Delaware', 'District of Columbia', 'Florida', 'Georgia', 'Hawaii', 'Idaho', 'Illinois', 'Indiana', 'Iowa', 'Kansas', 'Kentucky', 'Louisiana', 'Maine', 'Maryland', 'Massachusetts', 'Michigan', 'Minnesota', 'Mississippi', 'Missouri', 'Montana', 'Nebraska', 'Nevada', 'New Hampshire', 'New Jersey', 'New Mexico', 'New York', 'North Carolina', 'North Dakota', 'Ohio', 'Oklahoma', 'Oregon', 'Pennsylvania', 'Rhode Island', 'South Carolina', 'South Dakota', 'Tennessee', 'Texas', 'Utah', 'Vermont', 'Virginia', 'Washington', 'West Virginia', 'Wisconsin', 'Wyoming', 'Canada', 'United Kingdom', 'Ireland', 'Germany', 'France', 'Netherlands', 'Luxembourg', 'Switzerland', 'Singapore', 'Hong Kong', 'Japan', 'Australia', 'Cayman Islands', 'Bermuda', 'British Virgin Islands'],
      'Formation Date': 'date',
      'Dissolution Date': 'date',
      'File Number': 'text',
      EIN: 'text',
      'Fiscal Year End': 'yearly',
      'Registered Agent': 'text',
      'Good Standing': 'tag',
      'Outside the Group': 'tag',
      'Others Hold the Rest': 'tag',
    });
    t.kind('Individual', { Name: 'text' });
    t.starts('Formation Date', entity);
    t.ends('Dissolution Date', entity);
    t.note('Required', t.entry('Entity Type', entity), true);
    t.note('Required', t.entry('Jurisdiction', entity), true);
    t.note('Required', t.entry('Formation Date', entity), true);
    const owns = t.relation('Ownership', ['Owner', 'Owned'], { kinds: [['Entity', 'Entity'], ['Individual', 'Entity']], lists: { Owner: 'Owners', Owned: 'Holdings' }, at: { Percentage: 'percent' } });
    const role = t.relation('Position', ['Holder', 'Company'], { kinds: [['Individual', 'Entity']], lists: { Holder: 'People', Company: 'Positions' }, roles: ['Director', 'Officer'], at: { Title: 'text', 'Start Date': 'date', 'End Date': 'date' } });
    t.starts('Start Date', role);
    t.ends('End Date', role);
    // Who a trust has: offered on an entity that's a trust, each a person or a company.
    const trust = { out: { choice: 'Trust' }, ...t.entry('Entity Type', entity) }, party = { args: [{ edge: 'Party', loc: {} }, { edge: 'Trust', loc: { args: [{ edge: 'Entity Type', loc: {} }] } }] };
    for (const kind of ['Individual', 'Entity']) for (const choice of ['Trustee', 'Grantor', 'Beneficiary']) t.spec({ out: { choice }, args: [{ edge: 'Party', loc: { kind } }, { edge: 'Trust', loc: trust }] });
    t.note('Name', party, 'Trust Role');
    t.note('Order', party, 1, { param: 'Party' });
    t.note('Order', party, 2, { param: 'Trust' });
    t.note('Name', party, 'Trust Parties', { param: 'Party' });
    t.note('Name', party, 'Trusts', { param: 'Trust' });

    // Who's the chart's own to track, in one place: every entity but one said to be outside the group (dendra.md, Ours to track).
    t.rule('Ours to Track', { at: entity, rows: [['Outside the group isn’t; every other entity is', '= IF([Outside the Group], FALSE, TRUE)']],
      about: 'Whether what’s owed and what’s to be on file are this chart’s to track for the entity: every entity, but one said to be Outside the Group, as a joint venture partner is. Type over it to say otherwise.' });
    t.note('Description', t.entry('Outside the Group', entity), 'That the entity is another’s, on the chart because it holds or is held: nothing’s tracked for it.');
    t.note('Description', t.entry('Others Hold the Rest', entity), 'That holders the chart doesn’t record hold what its owners don’t, so a shortfall in Ownership Adds Up is no problem.');
    const asked = (edge, also) => t.note('Required', t.entry(edge, entity), { when: 'Ours to Track', ...(also && { also }) });
    // (A register's own questions go to what's on a register: a trust has no file number or standing to ask after.)
    const registered = { when: 'Entity Type', is: ['Corporation', 'Limited Liability Company', 'Limited Partnership'] };
    asked('File Number', registered);
    asked('EIN');
    asked('Good Standing', registered);
    t.note('Fixed', t.entry('File Number', entity), true);
    t.note('Fixed', t.entry('EIN', entity), true);
    t.note('Fixed', t.entry('Fiscal Year End', entity), true);
    t.note('Check', t.entry('Good Standing', entity), true);

    // The arithmetic any ownership answers to.
    t.rule('Ownership Adds Up', { at: entity, check: true, rows: [
      ['Owners recorded', '= IF(SUM(Owners.Percentage) = 100%, TRUE)'],
      ['More than all of it', '= IF(SUM(Owners.Percentage) > 100%, FALSE)'],
      ['Owners missing', '= IF(COUNT(Owners.Percentage) > 0 AND [Ours to Track] <> FALSE AND NOT [Others Hold the Rest], FALSE)'],
    ], about: 'Whether what’s recorded of an entity’s owners comes to 100%. It finds more than all of it wherever it is; less, where the entity is ours to track and others aren’t said to hold the rest.' });
    const inRange = t.entry('Percentages In Range', { out: { tag: true }, args: [{ edge: 'Owner', loc: {} }, { edge: 'Owned', loc: entity }] });
    for (const owner of ['Entity', 'Individual']) t.spec({ out: { tag: true }, ...t.entry('Percentages In Range', { out: { tag: true }, args: [{ edge: 'Owner', loc: { kind: owner } }, { edge: 'Owned', loc: entity }] }) });
    t.note('Formula', inRange, [{ label: 'Percentage', formula: '= IF(Percentage < 0 OR Percentage > 100%, FALSE)' }]);
    t.note('Check', inRange, true);
    t.note('Description', inRange, 'Whether a holding’s Percentage is between 0% and 100%.');

    // A Delaware entity's tax, year by year, the years the calendar's. A corporation's franchise tax and annual report on or before March 1 of the next year; a limited partnership's, LLC's or general partnership's annual tax on or before June 1.
    t.kind('Tax Year', { Name: 'text' });
    t.note('Years', { kind: 'Tax Year' }, true);
    t.rule('Year', { at: { kind: 'Tax Year' }, type: 'number', rows: [['Its name', '= VALUE(Name)']] });
    const delaware = { out: { choice: 'Delaware' }, ...t.entry('Jurisdiction', entity) }, tax = { out: { tag: true }, args: [{ edge: 'Taxpayer', loc: delaware }, { edge: 'Tax Year', loc: { kind: 'Tax Year' } }] };
    const taxes = { args: [{ edge: 'Taxpayer', loc: { args: [{ edge: 'Jurisdiction', loc: {} }] } }, { edge: 'Tax Year', loc: {} }] };
    t.spec(tax);
    t.note('Name', taxes, 'Annual Tax');
    t.note('Order', taxes, 1, { param: 'Taxpayer' });
    t.note('Order', taxes, 2, { param: 'Tax Year' });
    t.note('Name', taxes, 'Taxpayers', { param: 'Taxpayer' });
    t.note('Name', taxes, 'Taxed For', { param: 'Tax Year' });
    t.note('Formula', { args: tax.args }, [{ label: 'Each year on the register', formula: '← Taxpayer.[Entity Type] IN {"Limited Partnership", "Limited Liability Company", "General Partnership", "Corporation"} AND Taxpayer.[Ours to Track] <> FALSE AND [Tax Year].Year >= YEAR(Taxpayer.[Formation Date])' }]);
    t.note('Description', { args: tax.args }, 'The Delaware tax an entity owes for a tax year, a corporation’s franchise tax or a limited partnership’s, LLC’s or general partnership’s annual tax: owed for every year it’s on the register, at any time in the year, and settled by the payment recorded at it.');
    t.entries(tax, { 'Annual Tax Paid': 'date' });
    t.rule('Annual Tax Due', { at: tax, type: 'date', rows: [
      ['A corporation’s franchise tax, with its annual report: March 1 after the tax year, until paid', '= IF(ISBLANK([Annual Tax Paid]) AND Taxpayer.[Entity Type] = "Corporation", WORKDAY(DATE([Tax Year].Year + 1, 3, 1) + 1, -1))'],
      ['June 1 after the tax year, until paid', '= IF(ISBLANK([Annual Tax Paid]), WORKDAY(DATE([Tax Year].Year + 1, 6, 1) + 1, -1))'],
    ], about: 'When the tax year’s Delaware tax is due, until it’s paid: a corporation’s franchise tax and annual report on or before March 1 of the next year, a limited partnership’s, LLC’s or general partnership’s annual tax on or before June 1, or the business day before when that falls on a weekend. Late, it costs a $200 penalty and 1.5% a month.' });
    t.rule('Annual Tax Amount', { at: tax, type: 'money', rows: [
      ['A limited partnership, LLC or general partnership, from tax year 2026', '= IF(Taxpayer.[Entity Type] <> "Corporation" AND [Tax Year].Year >= 2026, $400)'],
      ['A limited partnership, LLC or general partnership, through tax year 2025', '= IF(Taxpayer.[Entity Type] <> "Corporation", $300)'],
    ], about: 'The Delaware annual tax of a limited partnership, LLC or general partnership for the tax year: $300 through tax year 2025, $400 from tax year 2026 (HB 400). A corporation’s franchise tax is its own.' });
    t.rule('Paid Late', { at: tax, rows: [['After the day it was due', '← [Annual Tax Paid] > WORKDAY(DATE([Tax Year].Year + 1, IF(Taxpayer.[Entity Type] = "Corporation", 3, 6), 1) + 1, -1)']],
      about: 'Whether the tax year’s Delaware tax was paid after the day it was due. See Late Charges for what that costs.' });
    t.rule('Late Charges', { at: tax, type: 'text', rows: [['Paid late, or past due and unpaid', '= IF([Paid Late] OR (ISBLANK([Annual Tax Paid]) AND [Annual Tax Due] < TODAY()), "$200 penalty, and interest of 1½% for each month or part of one until paid, on top of the tax")']],
      about: 'What a late Delaware tax costs besides the tax itself, which Annual Tax Amount doesn’t include and nothing here works out: a limited partnership’s or LLC’s $200 penalty, added to the tax, and interest of 1½% for each month or part of one until paid (Delaware Code, title 6, sections 17-1109 and 18-1107); a corporation’s the same on its franchise tax and annual report (title 8, sections 502(c) and 504(c)).' });

    // What's beyond the dates kept: said of each entity it's so of, and on the list of what this chart doesn't track.
    t.rule('Dates Not Tracked', { at: entity, type: 'text', rows: [['Outside Delaware', '= IF(NOT ISBLANK(Jurisdiction) AND Jurisdiction <> "Delaware" AND [Ours to Track] <> FALSE, Jurisdiction & "’s annual report, taxes and registered agent")']],
      about: 'What this chart doesn’t work out for an entity of ours: the dates it keeps are Delaware’s, so another jurisdiction’s aren’t here, and none showing is no sign none is due.' });
    t.note('Not Tracked', { kind: 'View' }, [
      { name: 'Other states’ dates', of: 'Dates Not Tracked', names: ['Foreign qualification', 'Qualified to do business', 'Registered agent', 'Franchise tax', 'Annual report', 'Other states'], about: 'The dates kept are Delaware’s. Another jurisdiction’s annual report, taxes and registered agent, and qualifying to do business in a state, aren’t tracked.' },
      { name: 'Beneficial ownership reports', names: ['Beneficial ownership report', 'BOI', 'Corporate Transparency Act', 'CTA', 'FinCEN'], about: 'Whether a company owes FinCEN a beneficial ownership report isn’t tracked.' },
      { name: 'Securities and tax filings', names: ['Form D', 'Blue sky', 'State notice', 'Schedule 13D', 'Tax return', 'K-1'], about: 'What a company files with the SEC or a state securities office, and its tax returns other than the Delaware tax here, aren’t tracked.' },
      { name: 'What a change of control sets off', names: ['Change of control', 'Assignment', 'Consent', 'Control change'], about: 'A transfer says who moved. Whether that needs a consent or a filing isn’t asked.' },
    ]);

    // Its documents, and what's to be on file for each entity that's ours.
    t.kind('Document', { Name: 'text', Link: 'document',
      'Document Type': ['Certificate of Incorporation', 'Articles of Incorporation', 'Certificate of Formation', 'Articles of Organization', 'Certificate of Limited Partnership', 'Bylaws', 'Operating Agreement', 'Limited Partnership Agreement', 'Partnership Agreement', 'Trust Agreement', 'Consent', 'Resolution', 'Minutes', 'Stock Certificate', 'Tax Document', 'Correspondence'],
      'Document Date': 'date', Status: ['Draft', 'Executed', 'Filed', 'Final', 'Superseded'] });
    for (const e of ['Link', 'Document Type', 'Document Date', 'Status']) t.note('Required', t.entry(e, { kind: 'Document' }), true);
    t.relation('Concerns', ['Document', 'Subject'], { kinds: [['Document', 'Entity']], lists: { Document: 'Documents', Subject: 'Subjects' } });
    const onFile = (edge, about, row, more = []) => {
      for (const choice of ['Corporation', 'Limited Liability Company', 'Limited Partnership', ...more]) t.spec({ out: { tag: true }, ...t.entry(edge, { out: { choice }, ...t.entry('Entity Type', entity) }) });
      const p = t.entry(edge, t.entry('Entity Type', entity));
      t.note('Formula', p, [{ label: '', formula: row }]);
      t.note('Check', p, true);
      t.note('Description', p, about);
    };
    const held = 'ANY(Documents, @.[Document Type] IN wanted AND @.Status IN {"Executed", "Filed", "Final"})';
    onFile('Formation Document on File', 'Whether the document that formed the entity is on file, executed, filed or final: a corporation’s certificate or articles of incorporation, an LLC’s certificate of formation or articles of organization, a limited partnership’s certificate.',
      `= IF([Ours to Track] <> FALSE, LET(wanted, IF(@ = "Limited Partnership", {"Certificate of Limited Partnership"}, IF(@ = "Limited Liability Company", {"Certificate of Formation", "Articles of Organization"}, {"Certificate of Incorporation", "Articles of Incorporation"})), ${held}))`);
    onFile('Governing Agreement on File', 'Whether the agreement that governs the entity is on file, executed, filed or final: a corporation’s bylaws, an LLC’s operating agreement, a limited partnership’s agreement, a trust’s trust agreement.',
      `= IF([Ours to Track] <> FALSE, LET(wanted, IF(@ = "Limited Partnership", {"Limited Partnership Agreement"}, IF(@ = "Limited Liability Company", {"Operating Agreement"}, IF(@ = "Trust", {"Trust Agreement"}, {"Bylaws"}))), ${held}))`, ['Trust']);

    t.page('structure', 'Structure', 1, { title: { format: { Bold: false, Color: '#1f3a5f' } }, date: { format: { Size: 10, Color: '#5f6b78' } }, key: { format: { Outline: 'none' } } });
    t.note('Shown', { kind: 'Document' }, false, { view: 'structure' });
    t.note('Shown', { kind: 'Tax Year' }, false, { view: 'structure' });
    t.shown('structure', field('Name'));
    t.shown('structure', t.entry('Jurisdiction', {}), { Color: '#5f6b78', Format: 'paren' });
    t.style('structure', individual, 'Individual', { Shape: 'oval' });
    t.style('structure', type('Corporation'), 'Corporation', { Shape: 'rect', Fill: '#eef2f7' });
    t.style('structure', type('Limited Liability Company'), 'Limited liability company', { Shape: 'rounded', Fill: '#eef2f7' });
    t.style('structure', type('Limited Partnership'), 'Partnership', { Shape: 'triangle', Fill: '#dde4ec' });
    t.style('structure', type('General Partnership'), 'Partnership', { Shape: 'triangle', Fill: '#dde4ec' });
    t.style('structure', type('Trust'), 'Trust', { Shape: 'hexagon', Fill: '#efe9dc' });
    t.style('structure', type('Branch'), 'Branch', { Shape: 'rect', Dash: 'dashed' });
    // (At each row it's for, so no row of its own in the Key, and a partnership keeps its triangle.)
    const banded = { id: 'company-entity', name: 'A band at its side', base: {}, parts: [
      { id: 'band', geometry: 'rect', x: 0, y: 0, w: 0.05, h: 1, format: { Fill: '{Outline}', Outline: 'none' } },
      { id: 'rest', rest: true, geometry: 'text', x: 0.05, y: 0, w: 0.95, h: 1, format: { Align: 'center', Valign: 'middle' } }] };
    t.design('structure', type('Corporation'), banded);
    t.design('structure', type('Limited Liability Company'), banded);
    t.style('structure', { out: { tag: false }, ...t.entry('Good Standing', {}) }, 'Not in good standing', { Outline: '#c00000', Weight: 2, Dash: 'dashed' });
    t.style('structure', { out: { tag: true }, ...owns }, 'Ownership', { Outline: '#3a4653', Weight: 1 });
    t.note('Shown', { out: { tag: true }, ...owns }, true, { view: 'structure' });
    t.note('Format', { out: { tag: true }, ...owns }, 'none', { view: 'structure' });
    t.note('Arrow', { out: { tag: true }, ...owns }, 'auto', { view: 'structure' });
    t.shown('structure', { out: { field: 'percent' }, ...t.entry('Percentage', owns) });
    t.note('Shown', role, false, { view: 'structure' });
    // (A trustee's line is told from a holding's at a glance; who else a trust has is on its panel.)
    t.note('Shown', party, false, { view: 'structure' });
    const trustee = { out: { choice: 'Trustee' }, ...party };
    t.style('structure', trustee, 'Trustee', { Outline: '#3a4653', Weight: 1, Dash: 'dashed' });
    t.note('Shown', trustee, true, { view: 'structure' });
    t.note('Format', trustee, 'none', { view: 'structure' });
    t.note('Arrow', trustee, 'auto', { view: 'structure' });
    t.table('entities', 'Entities', 2, entity);
    t.table('ownership', 'Ownership', 3, owns);
    t.table('positions', 'Directors and officers', 4, role);
    t.table('dates', 'Dates', 5, 'date');
    t.table('documents', 'Documents', 6, { kind: 'Document' });
  }),
  example: {
    boxes: { p: ['Individual', { Name: 'R. Vance' }], h: ['Entity', { Name: 'Holdings', 'Entity Type': 'Corporation' }], a: ['Entity', { Name: 'Opco', 'Entity Type': 'Limited Liability Company' }], b: ['Entity', { Name: 'Ventures', 'Entity Type': 'Limited Partnership' }], c: ['Entity', { Name: 'Propco', 'Entity Type': 'Corporation' }] },
    lines: [{ Owner: 'p', Owned: 'h', entries: { Percentage: 1 } }, { Owner: 'h', Owned: 'a', entries: { Percentage: 1 } }, { Owner: 'h', Owned: 'b', entries: { Percentage: 0.6 } }, { Owner: 'a', Owned: 'c', entries: { Percentage: 1 } }],
  },
});
