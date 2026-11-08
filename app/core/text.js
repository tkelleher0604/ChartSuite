// Text shared by designs, scoped annotations and their editors. Stored strings keep the existing
// {Field} and {Field|initials} syntax. Escaped braces are literal; only an inserted field is a token.
// This module knows neither records nor the DOM: callers decide how a field is read.
const TextTemplate = (() => {
const formula = text => /^\s*=/.test(text ?? '');
const label = field => field.split('|')[0].trim();

function parts(text) {
  const source = String(text ?? ''), out = [];
  const pattern = /\\([\\{}=])|\{([^{}\n]+)\}/g;
  let from = 0, plain = '';
  for (const m of source.matchAll(pattern)) {
    plain += source.slice(from, m.index);
    if (m[1]) plain += m[1];
    else {
      if (plain) out.push({ text: plain });
      out.push({ field: m[2] });
      plain = '';
    }
    from = m.index + m[0].length;
  }
  plain += source.slice(from);
  if (plain) out.push({ text: plain });
  return out;
}

const literal = text => String(text ?? '').replace(/[\\{}]/g, '\\$&').replace(/^(\s*)=/, '$1\\=');
const field = name => `{${name}}`;
const render = (text, read) => parts(text).map(p => p.field === undefined ? p.text : read(p.field) ?? '').join('');
const fields = text => formula(text) ? [] : parts(text).filter(p => p.field !== undefined).map(p => label(p.field));
function single(text) {
  if (formula(text)) return null;
  const all = parts(text).filter(p => p.field !== undefined || p.text.trim());
  return all.length === 1 && all[0].field !== undefined ? all[0].field : null;
}
// Dropping a field adds it. Replacing one is an explicit action on its chip.
const append = (text, name) => `${text ?? ''}${text && !text.endsWith('\n') ? '\n' : ''}${field(name)}`;
// Runs count edited characters: decode storage escapes but keep each field's source spelling.
const characters = text => formula(text) ? String(text ?? '') : render(text, field);
// One input changes the middle between its unchanged prefix and suffix. Retained characters keep
// their look; inserted/replaced characters start unformatted. Deleting through a run clips it.
// Apply after each input, not just on blur, so separate edits do not erase the style between them.
function editRuns(before, after, runs = []) {
  const a = characters(before), b = characters(after);
  if (a === b) return runs;
  let from = 0, end = a.length, next = b.length;
  while (from < end && from < next && a[from] === b[from]) from++;
  while (end > from && next > from && a[end - 1] === b[next - 1]) { end--; next--; }
  const by = next - end;
  return runs.flatMap(run => {
    const left = { ...run, to: Math.min(run.to, from) }, right = { ...run, from: Math.max(run.from, end) + by, to: run.to + by };
    const kept = [left, right].filter(r => r.to > r.from);
    if (kept.length === 2 && left.to === right.from) return [{ ...run, to: right.to }];
    return kept;
  });
}
// Project formatting while fields are substituted, never by searching for a matching word in
// the result. A fully covered token styles its whole value; a partial token styles none of it.
// Escapes have already been decoded by parts(), so every range uses the editor's coordinates.
function renderRuns(source, read, runs = []) {
  let text = '', at = 0;
  const projected = [], looks = run => JSON.stringify({ ...run, from: 0, to: 0 });
  const add = run => {
    const last = projected.at(-1);
    if (last && last.to === run.from && looks(last) === looks(run)) last.to = run.to;
    else projected.push(run);
  };
  for (const part of parts(source)) {
    const token = part.field !== undefined, before = token ? field(part.field) : part.text, after = String(token ? read(part.field) ?? '' : part.text);
    for (const run of runs) {
      if (token) {
        if (after.length && run.from <= at && run.to >= at + before.length) add({ ...run, from: text.length, to: text.length + after.length });
      } else {
        const from = Math.max(at, run.from), to = Math.min(at + before.length, run.to);
        if (to > from) add({ ...run, from: text.length + from - at, to: text.length + to - at });
      }
    }
    at += before.length; text += after;
  }
  return { text, runs: projected };
}
return { parts, literal, field, render, fields, single, formula, label, append, characters, editRuns, renderRuns };
})();
