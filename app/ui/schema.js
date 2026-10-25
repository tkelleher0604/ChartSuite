// The Schema: the chart's vocabulary, on a page of its own. It is the record panel's Schema view and its
// definitions' views (panel.js), drawn at full width, so there's one way the vocabulary is shown and edited:
// forms with their names, list names, required entries and definitions; the filters All, Computed and
// Unused; and a definition's editor. The panel routes by the address, as everywhere: #schema,
// #schema:computed, #schema:unused, #definition:<id>, #definition:new:entry, ….
//
// Here the panel is the page, not a side panel, so the links in it that lead out of the vocabulary go to
// the app's pages instead (a record to its page, a kind to its table), each change it makes is confirmed in
// a toast with Undo, as on every page, and what it can't do is said above it.

(() => {
  // Where the panel's own addresses lead on this page: the vocabulary's stay here; the rest go elsewhere.
  const VOCABULARY = /^(schema(:computed|:unused)?|formulas|(definition|formula):.+)$/;
  const hashOf = href => { try { return decodeURIComponent(String(href).replace(/^#/, '')); } catch { return String(href).replace(/^#/, ''); } };
  function outward(hash) {
    const h = hashOf(hash);
    if (VOCABULARY.test(h)) return null;
    if (h.startsWith('kind:')) return Shell.kindHref(h.slice(5));
    if (records[h]) return Shell.recordHref(h);
    return '#schema';
  }
  // An address that isn't the vocabulary's is put right before the panel draws it.
  function settle() {
    const to = outward(location.hash);
    if (!to) return true;
    if (to.startsWith('#')) { window.history.replaceState(null, '', to); return true; }
    location.replace(to);
    return false;
  }
  document.addEventListener('click', e => {
    const a = e.target.closest?.('#panel a[href^="#"]');
    const to = a && outward(a.getAttribute('href'));
    if (!to) return;
    e.preventDefault();
    e.stopPropagation();
    if (to.startsWith('#')) location.hash = to; else location.href = to;
  }, true);

  // ---- What the page says about a change ----
  // A change made here is confirmed in a toast, in the panel's words for it or else the history's, with
  // Undo; an undo or redo, with the way back. Only what's done on this page counts, not another tab's
  // changes arriving.
  let seen;  // the newest entry in the history when the page last drew
  let acting = false;
  for (const type of ['click', 'change', 'keydown']) document.addEventListener(type, () => { acting = true; }, true);
  function confirmChange() {
    const head = historyLog[0];
    const fresh = head && seen !== undefined && head.id !== seen;
    seen = head?.id ?? null;
    if (!fresh || !acting) return;
    if (head.source === 'undo') Shell.toast('Undone', { action: { label: 'Redo', run: () => { redo(); render(); } } });
    else if (head.source === 'redo') Shell.toast('Redone', { action: { label: 'Undo', run: () => { undo(); render(); } } });
    else Shell.toast(ui.info ?? `${head.summary}.`, { action: { label: 'Undo', run: () => { undo(); render(); } } });
    ui.info = null;
  }

  // There's room here for a rule's implications to take a line each, where the side panel runs them
  // together on one line, three spaces apart. Only the panel's own text is split.
  function spreadRules() {
    for (const code of document.querySelectorAll('#panel .schema-rule')) {
      const lines = code.textContent.split(/ {3}(?=←)/);
      if (lines.length > 1) code.innerHTML = lines.map(l => `<span class="schema-rule-line">${esc(l)}</span>`).join('');
    }
  }

  // The page's title follows the panel's view: the Schema, or a definition by its name.
  function viewed() {
    const view = currentView();
    if (!view.formula) return { title: 'Schema', crumbs: [] };
    const d = view.formula.id && definitionOf(view.formula.id);
    return { title: d ? d.name : view.formula.isNew ? 'New definition' : 'Definition', crumbs: [{ text: 'Schema', href: '#schema:computed' }] };
  }

  window.addEventListener('hashchange', () => settle());
  Shell.onChartChange(() => { clearForms(); ui.expanded.clear(); });

  Shell.start({
    area: 'schema',
    // The panel takes the undo keys, as it does on every page it's on.
    undo: false,
    title: () => viewed().title,
    crumbs: () => viewed().crumbs,
    render: () => `<div class="content schema-page"><div class="schema-notice" id="schema-notice" role="alert"></div><div class="panel schema-panel" id="panel"></div></div>`,
    after() {
      if (!settle()) return;
      renderPanel();
      spreadRules();
      restoreFocus();
      document.getElementById('schema-notice').innerHTML = ui.notice ? `${icon('alert-triangle')}<span>${esc(ui.notice)}</span>` : '';
      confirmChange();
      acting = false;
    },
    commands: () => [
      { title: 'New definition of an entry', keywords: 'formula field choice tag computed', run: () => { location.hash = 'definition:new:entry'; } },
      { title: 'New definition of a relation', keywords: 'formula computed relation', run: () => { location.hash = 'definition:new:relation'; } },
      { title: 'Show computed forms', keywords: 'schema definitions formulas', run: () => { location.hash = 'schema:computed'; } },
      { title: 'Show unused specifications', keywords: 'schema remove', run: () => { location.hash = 'schema:unused'; } },
      ...allDefinitions().map(d => ({ title: d.name, meta: 'Definition', keywords: 'definition formula', run: () => { location.hash = `definition:${d.id}`; } })),
    ],
  });
})();
