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
return { parts, literal, field, render, fields, single, formula, label, append };
})();
