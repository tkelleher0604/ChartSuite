// The pieces every area draws records with, so a record reads the same wherever it's shown: a chip for an
// object, its output, a date or a time, a status badge, an empty state. One global, `Parts`; each part
// returns markup. Loaded after shell.js. Styles are in shell.css.

const Parts = (() => {
  // An object, named, linking to its page, with one detail after the name (Fund III · 64%). Hovering
  // says what it is, since legal names collide. A computed relation's chip is dashed.
  function chip(id, { detail = '', computed = false } = {}) {
    if (!records[id]) return '';
    return `<a class="chip${computed ? ' is-computed' : ''}" href="${Shell.recordHref(id)}" title="${esc(objectName(id))} · ${esc(Shell.subtitleOf(id))}${computed ? ' · worked out by formula' : ''}">
      <span class="chip-text">${esc(objectName(id))}</span>${detail ? `<span class="chip-detail">${esc(detail)}</span>` : ''}</a>`;
  }
  // An object's name as a link to its page, for a table's first column.
  const link = id => records[id] ? `<a class="row-link" href="${Shell.recordHref(id)}">${esc(objectName(id))}</a>` : '';

  // A record's output as text: a field's value in its datatype's format, a choice's option, a tag's state.
  const outputText = r => isField(r) ? displayValue(r) : isChoice(r) ? r.choice : isTag(r) ? (r.tag ? 'Attested' : 'Ruled out') : r.kind;
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

  // ---- What a formula has a say in ----
  // A tag's checkbox, which shows the other state on hover; `attrs` say what a click does. A tag a formula
  // worked out is outlined rather than filled.
  function tagBox(id, attrs = '') {
    const box = checkbox(records[id].tag, attrs);
    return isComputed(id) ? `<span class="is-implied">${box}</span>` : box;
  }
  // What a definition's formula gives, in words: attested, 4.5%, June 1, 2027, #DIV/0!, nothing.
  function formulaText(d, v) {
    if (v === null || v === undefined) return 'nothing';
    if (Formulas.isError(v)) return v.code;
    if (typeof v === 'boolean') return v ? 'attested' : 'ruled out';
    if (typeof v === 'number') return showValue(d?.datatype ?? 'number', v);
    if (v?.t === 'date') return formatDate(v.iso);
    return String(v);
  }
  // The corner mark, as in Excel, on an entered record a formula also covers: strong (amber) where it
  // differs from what the formula gives, or rules out what it implies; quiet where they agree. It says so
  // on hover; `attrs` say what a click does (the panel explains it; a table offers Use formula).
  function overrideMark(id, attrs = '') {
    const info = formulaInfo(id);
    const d = info && !isComputed(id) && definitionOf(info.def);
    if (!d) return '';
    const strong = info.mark === 'differs' || info.mark === 'overrides';
    const says = info.mark === 'overrides' ? `${d.name} implies it` : info.mark === 'also implied' ? `Also implied by ${d.name}` : `${d.name} gives ${formulaText(d, info.formula)}`;
    return `<button class="ovr-mark${strong ? ' is-strong' : ''}" ${attrs} aria-label="${esc(says)}" title="${esc(says)}"></button>`;
  }
  // A formula's error where its output would be (#CIRCULAR!, #DIV/0!), linking to its definition if `href`.
  const formulaError = (code, { href = '', title = '' } = {}) => href
    ? `<a class="fx-error" href="${esc(href)}"${title ? ` title="${esc(title)}"` : ''}>${esc(code)}</a>`
    : `<span class="fx-error"${title ? ` title="${esc(title)}"` : ''}>${esc(code)}</span>`;

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
  // How far off a date is, in words: Today, Tomorrow, In 12 days, 3 days ago; then months and years, since
  // "In 412 days" or "28,505 days ago" reads as nothing in particular.
  function dueText(iso) {
    const n = daysUntil(iso), far = Math.abs(n);
    if (far >= 60) {
      const text = far < 548 ? count(Math.round(far / 30.44), 'month') : count(Math.round(far / 365.25), 'year');
      return n > 0 ? `In ${text}` : `${text} ago`;
    }
    return n === 0 ? 'Today' : n === 1 ? 'Tomorrow' : n === -1 ? 'Yesterday' : n > 0 ? `In ${count(n, 'day')}` : `${count(-n, 'day')} ago`;
  }
  // A moment (an ISO timestamp) relative to now, with the exact time on hover: 5 min ago, 3 h ago (today),
  // Yesterday, Oct 12. Days are calendar days where the viewer is.
  function when(stamp) {
    const t = new Date(stamp), min = Math.round((Date.now() - t) / 60000);
    const dayOf = d => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 864e5;
    const daysAgo = dayOf(new Date()) - dayOf(t);
    const local = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
    const text = min < 1 ? 'Just now' : min < 60 ? `${min} min ago` : daysAgo === 0 ? `${Math.round(min / 60)} h ago`
      : daysAgo === 1 ? 'Yesterday' : date(local).replace(`, ${new Date().getFullYear()}`, '');
    return `<time class="faint tnum" datetime="${esc(stamp)}" title="${esc(t.toLocaleString())}">${esc(text)}</time>`;
  }

  // A status: tone '' (neutral), 'success', 'warn', 'danger', 'computed' or 'accent'.
  const badge = (text, tone = '') => `<span class="badge${tone ? ` is-${tone}` : ''}">${esc(text)}</span>`;

  // ---- Documents ----
  // A file's type as its glyph (SharePoint.docIcon), the one icon that earns its place: a document's link
  // read by SharePoint.parseDocUrl, or a file in the library, has its `kind`. cls 'is-large' sets it in a
  // tile; 'is-empty' fades it, for a document with no file yet.
  function file(kind = 'other', cls = '') {
    const g = SharePoint.docIcon(kind);
    return `<span class="doc-glyph${cls ? ` ${cls}` : ''}" title="${esc(g.title)}">${g.svg}</span>`;
  }
  // A document's status (a cell of Documents' rows) as a badge: in force, in progress, or no longer
  // current; in italics where a formula gave it.
  const STATUS_TONES = { executed: 'success', filed: 'success', final: 'success', signed: 'success', effective: 'success',
    superseded: 'faint', terminated: 'faint', expired: 'faint', withdrawn: 'faint' };
  const docStatus = cell => !cell ? '' : `<span class="${cell.computed ? 'computed-text' : ''}"${cell.computed ? ' title="Worked out by formula"' : ''}>${badge(cell.text, STATUS_TONES[norm(cell.text)] ?? '')}</span>`;

  // A filter above a list, as a chip. Unset, it reads "+ Label", and opens its menu (`cmd`, a Shell
  // handler). Set, it reads what it's set to, `Label: <b>value</b>`, or `text` (markup) where a sentence
  // says it better, and opens its menu again; × clears it (`clear`). `data` goes on both, as data
  // attributes; `tone` 'warn' marks a filter for what needs attention.
  function filterChip({ label, value = '', text = '', cmd, clear, data = {}, title = '', tone = '' }) {
    const attrs = Object.entries(data).map(([k, v]) => ` data-${k}="${esc(v)}"`).join('');
    if (!value && !text) return `<button class="filter-chip" data-cmd="${esc(cmd)}"${attrs} aria-haspopup="menu">${icon('plus')}${esc(label)}</button>`;
    const shown = text || `${esc(label)}: <b>${esc(value)}</b>`;
    return `<span class="filter-chip is-set${tone ? ` is-${tone}` : ''}"><button class="filter-chip-main" data-cmd="${esc(cmd)}"${attrs} aria-haspopup="menu" title="${esc(title || (value ? `${label}: ${value}` : label))}"><span class="filter-chip-text">${shown}</span></button>`
      + `<button class="filter-chip-x" data-cmd="${esc(clear)}"${attrs} aria-label="Clear ${esc(label)}" title="Clear">${icon('x')}</button></span>`;
  }

  // A table's column heading. A click sorts by the column (`cmd`, a Shell handler), ascending, then
  // descending; `sort` says how it's sorted now (1, -1 or 0), as aria-sort on the th. Where the table has a
  // menu for its columns (`menu`, a handler), a chevron that shows on hover opens it, and so does a
  // right-click on the heading. `data` goes on the th and both buttons; `extra` is markup after the label,
  // like a required mark; `cls` the th's classes.
  function columnHead({ label, sort = 0, cmd, menu = '', data = {}, cls = '', extra = '', title = '' }) {
    const attrs = Object.entries(data).map(([k, v]) => ` data-${k}="${esc(v)}"`).join('');
    const arrow = sort ? (sort > 0 ? '↑' : '↓') : '';
    return `<th class="${esc(cls)}"${attrs} aria-sort="${sort > 0 ? 'ascending' : sort < 0 ? 'descending' : 'none'}"><div class="th-in">
      <button class="th-sort${sort ? ' is-on' : ''}" data-cmd="${esc(cmd)}"${attrs}${title ? ` title="${esc(title)}"` : ''}><span class="th-text">${esc(label)}</span>${extra}<span class="th-arrow" aria-hidden="true">${arrow}</span></button>
      ${menu ? `<button class="th-menu" data-cmd="${esc(menu)}"${attrs} aria-haspopup="menu" aria-label="${esc(label)}: sort, filter and more" title="Sort, filter and more">${icon('chevron-down')}</button>` : ''}</div></th>`;
  }

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

  return { chip, link, output, outputText, tagBox, formulaText, overrideMark, formulaError, date, daysUntil, dueText, when, badge, file, docStatus, filterChip, columnHead, empty, avatar };
})();
