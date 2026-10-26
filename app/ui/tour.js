// A short guided tour of the app: a card that walks through each area, page by page, saying what it's for.
// One global, `Tour`, with start() and stop(); the shell offers it in the palette and the welcome. Where the
// tour is lives in sessionStorage, so it carries across the pages it visits and ends with the tab. Each step
// names its page (and address), and optionally something on it to point at; a step whose target isn't there
// just has nothing pointed at. Loaded after parts.js.

const Tour = (() => {
  const KEY = 'rboreal.tour';
  const STEPS = [
    { page: 'index.html', title: 'Welcome to Rboreal', text: 'A system of record for a fund legal team: entities, ownership, people, documents and deadlines, kept once, with charts, deadlines and what’s missing worked out from them. This tour takes two minutes.' },
    { page: 'index.html', title: 'Home', text: 'What needs attention: deadlines overdue or due soon, required entries left blank, checks that don’t hold, and the latest changes, with who made them.' },
    { page: 'chart.html', title: 'The chart', text: 'Drawn from the records, in views along the bottom: the whole structure, one fund family, the 40 Act analysis. Click a box to see its record beside it; double-click the sheet to add one.' },
    { page: 'chart.html', target: '.tb-actions', title: 'Export and present', text: 'Export… makes an editable PowerPoint slide or a PDF of any view, drawn from the same data. Present shows the chart full screen; the arrow keys step through the views.' },
    { page: 'record.html', hash: 'fund', title: 'A record', text: 'Everything about one entity: its details, its relations, its documents, its dates and its history. A value in italics is worked out by a formula; its Why says what it means and why it’s there.' },
    { page: 'records.html', hash: 'Entity', title: 'Records', text: 'Each kind as a spreadsheet. Edit in place, paste rows from Excel, filter and sort. Every edit is recorded, and everything that depends on it updates.' },
    { page: 'documents.html', title: 'Documents', text: 'The index to the SharePoint library: what each file is and which records it concerns. The files stay in SharePoint; link or upload one, preview it, and find files no record points to.' },
    { page: 'calendar.html', title: 'Calendar', text: 'Every date in the chart, entered or worked out by a rule, as one agenda. Export it to Outlook.' },
    { page: 'history.html', title: 'History', text: 'Every change, who made it and when, with what it was before. Nothing is erased: taking a change back is itself recorded.' },
    { page: 'schema.html', title: 'Schema', text: 'The chart’s vocabulary in plain words: what each entry and relation means, and the rules that work things out.' },
    { page: 'settings.html', target: '.sb-search', title: 'That’s the tour', text: 'Settings keeps your name and where the workbook lives: this browser, a file, or a SharePoint library. Ctrl+K finds anything from anywhere, and ? lists the shortcuts.' },
  ];

  const read = () => { try { return JSON.parse(sessionStorage.getItem(KEY)); } catch { return null; } };
  const keep = step => { try { step === null ? sessionStorage.removeItem(KEY) : sessionStorage.setItem(KEY, JSON.stringify({ step })); } catch {} };
  const here = () => location.pathname.split('/').pop() || 'index.html';

  // Goes to a step: on this page, it's shown; on another, the page opens and shows it.
  function go(i) {
    if (i < 0 || i >= STEPS.length) return stop();
    keep(i);
    const s = STEPS[i];
    if (s.page !== here()) { location.href = s.hash ? `${s.page}#${s.hash}` : s.page; return; }
    if (s.hash && readHash() !== s.hash) location.hash = s.hash;
    draw();
  }
  const start = () => go(0);
  function stop() {
    keep(null);
    document.getElementById('tour')?.remove();
    document.querySelector('.tour-target')?.classList.remove('tour-target');
  }

  // Rings what the step points at. Pages redraw their top bar and sidebar as they're used, so it's done again
  // after each click.
  function point() {
    const t = read(), s = t && STEPS[t.step];
    document.querySelector('.tour-target')?.classList.remove('tour-target');
    if (s?.target && s.page === here()) document.querySelector(s.target)?.classList.add('tour-target');
  }
  function draw() {
    const t = read();
    document.getElementById('tour')?.remove();
    point();
    if (!t || STEPS[t.step]?.page !== here()) return;
    const s = STEPS[t.step], last = t.step === STEPS.length - 1;
    document.body.insertAdjacentHTML('beforeend', `
      <div class="tour" id="tour" role="dialog" aria-labelledby="tour-title">
        <div class="tour-step">${t.step + 1} of ${STEPS.length}</div>
        <h2 class="tour-title" id="tour-title">${esc(s.title)}</h2>
        <p class="tour-text">${esc(s.text)}</p>
        <div class="tour-actions">
          <button class="btn btn-sm btn-ghost" data-cmd="tour.stop">${last ? 'Close' : 'End tour'}</button>
          ${t.step ? '<button class="btn btn-sm" data-cmd="tour.back">Back</button>' : ''}
          ${last ? '' : '<button class="btn btn-sm btn-primary" data-cmd="tour.next">Next</button>'}
        </div>
      </div>`);
  }

  Shell.on('tour.next', () => go(read().step + 1));
  Shell.on('tour.back', () => go(read().step - 1));
  Shell.on('tour.stop', stop);
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && document.getElementById('tour') && !document.querySelector('#layer .dialog, #layer .palette')) stop(); });
  addEventListener('load', () => setTimeout(draw, 50));
  document.addEventListener('click', () => { if (read()) setTimeout(point); });

  return { start, stop, steps: STEPS.length };
})();
