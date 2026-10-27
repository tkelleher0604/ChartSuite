#!/usr/bin/env node
// dendra.js: keep a Dendra workbook from outside the window, with Dendra's own core (tool.js says how).
//   node dendra.js vocab <workbook.json> [--chart <name>]
//   node dendra.js show  <workbook.json> [--chart <name>] [--find <name>] [--day <2026-03-02>]
//   node dendra.js check <workbook.json> [--chart <name>] [--day <2026-03-02>]
//   node dendra.js apply <workbook.json> <plan.json> [--write]
//   node dendra.js new   <workbook.json> --name <chart name> --who <name> [--template <workbook.json>] [--from <chart>]
//   any of them: --app <Dendra's app folder>, if this script isn't in the Dendra repository's skills/dendra/scripts
// apply shows what a plan would record and writes it only with --write. Where there's no Node, dendra.sh runs
// the same tool in headless Chrome or Edge.
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');

const [command, ...rest] = process.argv.slice(2), files = [], flags = {};
for (let i = 0; i < rest.length; i++) {
  const a = rest[i];
  if (a === '--write') flags.write = true;
  else if (a.startsWith('--')) flags[a.slice(2)] = rest[++i];
  else files.push(a);
}
if (!command || command === 'help' || flags.help !== undefined) { process.stdout.write(fs.readFileSync(__filename, 'utf8').split('\n').slice(1, 10).map(l => l.replace(/^\/\/ ?/, '')).join('\n') + '\n'); process.exit(command ? 0 : 2); }

const app = path.resolve(flags.app ?? path.join(__dirname, '..', '..', '..', 'app'));
if (!fs.existsSync(path.join(app, 'core', 'log.js'))) { console.error(`Dendra's app folder isn't at ${app}; give it with --app.`); process.exit(2); }
const context = vm.createContext({ console });
const DendraTool = vm.runInContext([...['tree', 'notes', 'log', 'formulas'].map(f => fs.readFileSync(path.join(app, 'core', `${f}.js`), 'utf8')),
  fs.readFileSync(path.join(__dirname, 'tool.js'), 'utf8'), 'DendraTool'].join('\n;\n'), context);

const [book, planFile] = files;
if (!book) { console.error('Give the workbook file.'); process.exit(2); }
const read = f => fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : null;
const template = () => flags.template ? read(flags.template) ?? fail(`There's no template ${flags.template}.`)
  : vm.runInContext(`${fs.readFileSync(path.join(app, 'sample', 'calder-ridge.js'), 'utf8')}\n;JSON.stringify(SAMPLE)`, vm.createContext({}));
function fail(msg) { console.error(msg); process.exit(1); }

// Read, work, and write back only if nobody saved the file meanwhile; else work again from what's there now.
for (let tries = 0; ; tries++) {
  const text = read(book);
  if (text === null && command !== 'new') fail(`There's no workbook ${book}.`);
  const r = DendraTool.run(command, { ...flags, workbook: text, plan: planFile ? read(planFile) ?? fail(`There's no plan ${planFile}.`) : null, template: command === 'new' ? template() : null });
  if (!r.ok) fail(r.text);
  const writing = r.workbook && (command === 'new' || flags.write);
  if (writing && read(book) !== text) { if (tries < 5) continue; fail(`${book} kept changing as it was written; try again.`); }
  if (writing) { const tmp = `${book}.${process.pid}.tmp`; fs.writeFileSync(tmp, r.workbook); fs.renameSync(tmp, book); }
  process.stdout.write(r.text + '\n');
  if (command === 'apply' && r.workbook) process.stdout.write(writing
    ? `\nWritten to ${book}. Dendra takes it in when its tab is next in front, or open the file there (Ctrl+O).\n`
    : '\nNothing written: this was a dry run. Run it again with --write to record it.\n');
  break;
}
