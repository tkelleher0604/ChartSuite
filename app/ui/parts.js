// The pieces every area draws records with, so a record reads the same wherever it's shown: a chip for an
// object, its output, a date or a time, a status badge, an empty state. One global, `Parts`; each part
// returns markup. Loaded after shell.js. Styles are in shell.css.

const Parts = (() => {
  // An object, named, linking to its page, with one detail after the name (Fund III · 64%). Hovering
  // says what it is, since legal names collide. A computed relation's chip is dashed.
  function chip(id, { detail = '', computed = false } = {}) {
    if (!records[id]) return '';
    return `<a class="chip${computed ? ' is-computed' : ''}" href="${Shell.recordHref(id)}" title="${esc(Shell.subtitleOf(id))}${computed ? ' · worked out by formula' : ''}">
      <span class="chip-text">${esc(objectName(id))}</span>${detail ? `<span class="chip-detail">${esc(detail)}</span>` : ''}</a>`;
  }
  // An object's name as a link to its page, for a table's first column.
  const link = id => records[id] ? `<a class="row-link" href="${Shell.recordHref(id)}">${esc(objectName(id))}</a>` : '';

  // A record's output as text: a field's value in its datatype's format, a choice's option, a tag's state.
  const outputText = r => isField(r) ? displayValue(r) : isChoice(r) ? r.choice : isTag(r) ? (r.tag ? 'Yes' : 'Ruled out') : r.kind;
  // The same as markup: a tag as its checkbox, a document as a link to it, and what a formula worked out
  // in italics, saying so on hover.
  function output(id) {
    const r = records[id];
    if (!r) return '';
    const html = isTag(r) ? `<span class="tag-state" title="${r.tag ? 'Attested' : 'Ruled out'}">${box(r.tag)}</span>`
      : isField(r) && r.field === 'document' ? `<a class="link" href="${esc(r.value)}" target="_blank" rel="noopener">${esc(displayValue(r))}</a>`
      : esc(outputText(r));
    return isComputed(id) ? `<span class="computed-text" title="Worked out by formula">${html}</span>` : html;
  }

  // A calendar date (2027-06-01) as it reads: Jun 1, 2027.
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function date(iso) {
    if (!iso) return '';
    const [y, m, d] = iso.split('-').map(Number);
    return `${MONTHS[m - 1]} ${d}, ${y}`;
  }
  // Days from today to a calendar date: negative if it's past.
  function daysUntil(iso) {
    const today = new Date();
    const t = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
    const [y, m, d] = iso.split('-').map(Number);
    return Math.round((Date.UTC(y, m - 1, d) - t) / 864e5);
  }
  // How far off a date is, in words: Today, Tomorrow, In 12 days, 3 days ago.
  function dueText(iso) {
    const n = daysUntil(iso);
    return n === 0 ? 'Today' : n === 1 ? 'Tomorrow' : n === -1 ? 'Yesterday' : n > 0 ? `In ${count(n, 'day')}` : `${count(-n, 'day')} ago`;
  }
  // A moment (an ISO timestamp) relative to now, with the exact time on hover: 5 min ago, Yesterday, Oct 12.
  function when(stamp) {
    const t = new Date(stamp), min = Math.round((Date.now() - t) / 60000);
    const text = min < 1 ? 'Just now' : min < 60 ? `${min} min ago` : min < 1440 ? `${Math.round(min / 60)} h ago`
      : min < 2880 ? 'Yesterday' : date(stamp.slice(0, 10)).replace(`, ${new Date().getFullYear()}`, '');
    return `<time class="faint tnum" datetime="${esc(stamp)}" title="${esc(t.toLocaleString())}">${esc(text)}</time>`;
  }

  // A status: tone '' (neutral), 'success', 'warn', 'danger', 'computed' or 'accent'.
  const badge = (text, tone = '') => `<span class="badge${tone ? ` is-${tone}` : ''}">${esc(text)}</span>`;

  // What's missing, when it will appear, and the one action that adds it: { cmd } runs a Shell handler,
  // { href } goes somewhere. An empty result of a filter says so instead, with a way to clear it.
  function empty({ title, desc = '', action = null }) {
    const act = !action ? '' : action.href
      ? `<a class="btn btn-sm" href="${esc(action.href)}">${esc(action.label)}</a>`
      : `<button class="btn btn-sm" data-cmd="${esc(action.cmd)}"${action.data ? Object.entries(action.data).map(([k, v]) => ` data-${k}="${esc(v)}"`).join('') : ''}>${esc(action.label)}</button>`;
    return `<div class="empty-state"><div class="empty-title">${esc(title)}</div>${desc ? `<div class="empty-desc">${esc(desc)}</div>` : ''}${act}</div>`;
  }

  // A person's initials in a circle, for who made a change.
  const avatar = name => `<span class="avatar" title="${esc(name)}">${esc(clean(name).split(' ').filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('') || '?')}</span>`;

  return { chip, link, output, outputText, date, daysUntil, dueText, when, badge, empty, avatar };
})();
