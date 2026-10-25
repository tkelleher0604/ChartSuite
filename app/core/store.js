// Where the workbook is kept. A workbook (model.js) is one JSON document, and this browser's local storage
// always holds the working copy, under WORKBOOK_KEY, so every page opens at once and every tab stays in
// step. The workbook is kept in one of three places:
// - this browser: the working copy is all there is;
// - a file, through the File System Access API, with its handle remembered in IndexedDB. A folder that
//   OneDrive or SharePoint syncs works too. Where the API is missing, a copy can still be downloaded and
//   opened;
// - a SharePoint library, through the connector (sharepoint.js).
// The two places outside the browser sync the same way. A change is saved there after a pause, and each
// save names the version it replaces, so it's refused if someone saved there since: a conflict, which keeps
// both sides until someone chooses. A page that opens with nothing unsaved takes the copy there if it has
// changed. Offline or signed out, the working copy keeps every change until it can be saved.
// Also here: exporting the workbook as JSON, and importing one.
//
// One global, `Store`, with no page code. model.js calls Store.changed() whenever it writes the working
// copy; the sidebar shows the state through Shell.setStatus, and a page can follow it with Store.onChange.
// Load vendor/msal, then core/sharepoint.js, before this.

const Store = (() => {
  const KEY = 'rboreal.store';
  // The demo has no MSAL to remember who signed in, so it's remembered here, for the tab, as MSAL would.
  const DEMO_SESSION = 'rboreal.sharepoint.demoSession';
  const TOLD = 'rboreal.store.told';
  const SAVE_AFTER = 1200;          // ms of quiet after a change before it's saved
  const SHOW_SAVING_AFTER = 600;    // a save shows as under way only if it takes longer than this
  const LOOK_AFTER = 10000;         // a page looks at the copy elsewhere if no page has for this long
  const FILE_TYPES = [{ description: 'Rboreal workbook', accept: { 'application/json': ['.json'] } }];
  const canUseFiles = typeof showOpenFilePicker === 'function' && typeof showSaveFilePicker === 'function';
  const connector = () => SharePoint.connector;

  // Someone saved the copy elsewhere since this browser last saved or loaded it. `theirs` is that copy's
  // { version, at, by }.
  class Conflict extends Error { constructor(theirs) { super('Saved elsewhere since.'); this.theirs = theirs; } }
  // Something the person can put right: `fix` says how ('allow' access to a file, or 'open' it again).
  class StoreError extends Error { constructor(message, fix = null) { super(message); this.fix = fix; } }

  // ---- The record of where the workbook is kept ----
  // Kept in local storage, so every tab shares it:
  // - place: 'browser', 'file' or 'sharepoint';
  // - name: the file's name, or the workbook's name in the library; path: its path there;
  // - version: the copy there as of the last save or load (a file's last-modified time, or an eTag);
  // - synced: a fingerprint of the workbook as it was then, so that a change since shows;
  // - at, by: when that copy was saved, and by whom; checked: when a page last looked at it;
  // - conflict: { version, at, by } of a copy saved there while this one had changes too.
  const read = () => { try { return { place: 'browser', ...JSON.parse(localStorage.getItem(KEY)) }; } catch { return { place: 'browser' }; } };
  let rec = read();
  function keep(next) {
    rec = next;
    try { localStorage.setItem(KEY, JSON.stringify(rec)); } catch {}
  }
  const update = changes => keep({ ...read(), ...changes });

  // ---- The working copy ----

  // The working copy as text. A page that hasn't changed anything yet may not have written it.
  function workingText() {
    if (!localStorage.getItem(WORKBOOK_KEY) && workbook.charts.length) saveState();
    const text = localStorage.getItem(WORKBOOK_KEY);
    if (!text) throw new StoreError('This browser couldn’t keep the workbook.');
    return text;
  }

  // Which chart and view are current belong to the session, not the workbook (model.html, 6.3). They're
  // left out of what's saved elsewhere and of what's compared, so switching charts or views saves nothing,
  // and a copy taken from elsewhere keeps this browser's.
  function contentOf(text) {
    const wb = JSON.parse(text);
    delete wb.chartId;
    for (const c of [...(wb.charts ?? []), ...(wb.deleted ?? [])]) if (c.state) delete c.state.viewId;
    return JSON.stringify(wb);
  }
  // A short fingerprint of a text (cyrb53), to tell whether the workbook has changed.
  function hash(s) {
    let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      h1 = Math.imul(h1 ^ c, 2654435761);
      h2 = Math.imul(h2 ^ c, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
  }
  let printed = [null, null];
  const fingerprint = text => printed[0] === text ? printed[1] : (printed = [text, hash(contentOf(text))])[1];

  // Whether the working copy has changes that the copy elsewhere lacks.
  const unsaved = () => rec.place !== 'browser' && (!!rec.conflict || fingerprint(workingText()) !== rec.synced);

  // A workbook read from elsewhere, checked enough to be worth opening.
  function parseWorkbook(text, name) {
    let wb;
    try { wb = JSON.parse(text); } catch { throw new StoreError(`${name} isn’t a workbook: it isn’t JSON.`); }
    const ok = Array.isArray(wb?.charts) && wb.charts.length && wb.charts.every(c => c?.id && c.state?.records && c.state.schema
      && Array.isArray(c.state.views) && c.state.views.length);
    if (!ok) throw new StoreError(`${name} isn’t a Rboreal workbook, or was saved by an older version.`);
    return wb;
  }

  // Makes a copy from elsewhere the working copy, keeping the chart and views this browser had open, and
  // has the page read it again, as it would if another tab had written it.
  function adopt(text, theirs) {
    const wb = JSON.parse(text);
    let mine = null;
    try { mine = JSON.parse(localStorage.getItem(WORKBOOK_KEY)); } catch {}
    if (mine) {
      if (wb.charts.some(c => c.id === mine.chartId)) wb.chartId = mine.chartId;
      for (const c of wb.charts) {
        const viewId = mine.charts?.find(x => x.id === c.id)?.state?.viewId;
        if (c.state.views.some(v => v.id === viewId)) c.state.viewId = viewId;
      }
    }
    localStorage.setItem(WORKBOOK_KEY, JSON.stringify(wb));
    update({ version: theirs.version, synced: hash(contentOf(text)), at: theirs.at, by: theirs.by ?? null, checked: Date.now(), conflict: null });
    problem = null;
    reread();
  }
  // The shell reads the workbook again on the storage event; a page without the shell is told directly.
  function reread() {
    if (typeof Shell !== 'undefined' && Shell.page) return dispatchEvent(new StorageEvent('storage', { key: WORKBOOK_KEY }));
    initState();
    undoStack.length = redoStack.length = 0;
    if (typeof render === 'function') render();
  }

  // ---- The places outside the browser ----
  // Each loads its copy as { text, version, at, by }, and saves one as { version, at, by }, refusing with a
  // Conflict if its copy isn't the version named.

  let handle = null;  // the file's handle, as this page has it
  // IndexedDB can keep a file's handle, which local storage can't. Where it doesn't answer (some private
  // windows), the handle lasts only as long as the page, and the next page asks for the file again.
  function handles(mode, fn) {
    return new Promise((resolve, reject) => {
      setTimeout(() => reject(new Error('IndexedDB didn’t answer.')), 2000);
      const open = indexedDB.open('rboreal', 1);
      open.onupgradeneeded = () => open.result.createObjectStore('handles');
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        try {
          const tx = open.result.transaction('handles', mode);
          const req = fn(tx.objectStore('handles'));
          tx.oncomplete = () => { open.result.close(); resolve(req.result); };
          tx.onerror = tx.onabort = () => { open.result.close(); reject(tx.error); };
        } catch (e) { open.result.close(); reject(e); }
      };
    });
  }
  async function keepHandle(h) {
    handle = h;
    try { await handles('readwrite', s => h ? s.put(h, 'workbook') : s.delete('workbook')); } catch {}
  }
  // The file's handle, with leave to write to it. Asking for leave needs a click, so only an action asks.
  async function fileHandle({ ask = false } = {}) {
    if (!handle) try { handle = await handles('readonly', s => s.get('workbook')) ?? null; } catch {}
    if (!handle) throw new StoreError(`This browser no longer knows where ${rec.name} is. Open it again.`, 'open');
    const mode = { mode: 'readwrite' };
    if (await handle.queryPermission(mode) !== 'granted' && !(ask && await handle.requestPermission(mode) === 'granted'))
      throw new StoreError(`Allow access to ${rec.name} to save it there.`, 'allow');
    return handle;
  }
  const iso = ms => new Date(ms).toISOString();

  async function signedIn() {
    const c = connector();
    if (c.isDemo() && sessionStorage.getItem(DEMO_SESSION) && !(await c.isSignedIn())) await c.signIn();
    return c.isSignedIn();
  }
  async function needSignIn() {
    if (!(await signedIn())) throw new SharePoint.AuthError('Sign in to SharePoint first.', { interactive: true });
  }
  // The library as a place: "Fund Legal › Rboreal", from the site's address and the workbook folder.
  function libraryName() {
    const c = connector(), cfg = c.config();
    let site = '';
    try { site = decodeURIComponent((c.isDemo() ? SharePoint.DEMO.site : cfg.siteUrl).replace(/\/+$/, '').split('/').pop()); } catch {}
    return `${site.replace(/([a-z])([A-Z])/g, '$1 $2') || 'SharePoint'} › ${cfg.workbookFolder || 'Rboreal'}`;
  }

  const places = {
    file: {
      where: r => r.name,
      async load() {
        const file = await (await fileHandle()).getFile();
        return { text: await file.text(), version: file.lastModified, at: iso(file.lastModified), by: null };
      },
      async save(r, text, version) {
        const h = await fileHandle();
        const before = await h.getFile();
        if (version != null && before.lastModified !== version) throw new Conflict({ version: before.lastModified, at: iso(before.lastModified), by: null });
        const w = await h.createWritable();
        await w.write(text);
        await w.close();
        const after = await h.getFile();
        return { version: after.lastModified, at: iso(after.lastModified), by: null };
      },
    },
    sharepoint: {
      where: () => libraryName(),
      async load(r) {
        await needSignIn();
        const got = await connector().loadWorkbook(r.path);
        return { text: got.json, version: got.eTag, at: got.item.lastModified, by: got.item.lastModifiedBy };
      },
      async save(r, text, version) {
        await needSignIn();
        try {
          const got = await connector().saveWorkbook(r.path, text, version ?? undefined);
          return { version: got.eTag, at: got.item.lastModified ?? new Date().toISOString(), by: got.item.lastModifiedBy };
        } catch (e) {
          if (!(e instanceof SharePoint.ConflictError)) throw e;
          throw new Conflict({ version: e.current?.eTag ?? null, at: e.current?.lastModified ?? null, by: e.current?.lastModifiedBy ?? null });
        }
      },
    },
  };
  const whereOf = r => r.place === 'browser' ? 'this browser' : places[r.place].where(r);

  // ---- Syncing ----
  // One step at a time, each starting from the record as every tab last left it. Only the tab that made a
  // change saves it (the others follow through the storage event), so two tabs seldom save at once; if they
  // do, the second is refused as a conflict, and nothing is lost.

  let problem = null;    // what went wrong last, while it stands: { text, tone, fix }
  let saving = false, showSaving = false, timer = null, chain = Promise.resolve();

  // Saves what's changed here, or else takes what's changed there, if no page has looked for a while
  // (or `look` says to look now).
  function sync({ look = false } = {}) {
    clearTimeout(timer);
    timer = null;
    chain = chain.then(() => step(look)).catch(fail).then(report);
    return chain;
  }
  let op = 'save to';
  async function step(look) {
    rec = read();
    if (rec.place === 'browser' || rec.conflict) return;
    if (rec.place === 'sharepoint' && !navigator.onLine) throw new TypeError('Failed to fetch: offline');
    const text = workingText();
    if (fingerprint(text) !== rec.synced) return push(text);
    if (look || Date.now() - (rec.checked ?? 0) > LOOK_AFTER) return pull();
    problem = null;
  }
  async function push(text) {
    op = 'save to';
    const body = contentOf(text);
    saving = true;
    const shown = setTimeout(() => { showSaving = true; report(); }, SHOW_SAVING_AFTER);
    try {
      const got = await places[rec.place].save(rec, body, rec.version);
      update({ version: got.version, synced: hash(body), at: got.at, by: got.by ?? null, checked: Date.now() });
      problem = null;
    } finally {
      clearTimeout(shown);
      saving = showSaving = false;
    }
  }
  async function pull() {
    op = 'open';
    const theirs = await places[rec.place].load(rec);
    rec = read();
    problem = null;
    if (theirs.version === rec.version) return update({ checked: Date.now() });
    // A change made here while it was looking meets theirs.
    if (unsaved()) throw new Conflict(theirs);
    adopt(theirs.text, theirs);
    tell(theirs.by ? `Loaded ${theirs.by}’s changes from ${whereOf(rec)}` : `Loaded the latest from ${whereOf(rec)}`);
  }

  function fail(e) {
    if (e instanceof Conflict) {
      update({ conflict: e.theirs });
      problem = null;
      const who = e.theirs.by ? `${e.theirs.by} saved ${rec.name} after you last did` : `${rec.name} changed elsewhere`;
      if (typeof Shell !== 'undefined' && Shell.page?.area !== 'settings')
        Shell.toast(`Not saved: ${who}. Both copies are kept until you choose.`, { tone: 'error', action: { label: 'Review', run: () => { location.href = 'settings.html#workbook'; } } });
      return;
    }
    problem = describe(e);
    // Away from Settings, what puts it right is offered once a tab, on a toast, since it needs a click.
    const offer = {
      'sign-in': ['Signed out of SharePoint. Changes are kept in this browser until you sign in.', 'Sign in', signIn],
      allow: [`No access to ${rec.name}. Changes are kept in this browser until you allow it.`, 'Allow', allowFile],
    }[problem.fix];
    if (offer && typeof Shell !== 'undefined' && Shell.page?.area !== 'settings' && !sessionStorage.getItem(`${TOLD}.${problem.fix}`)) {
      sessionStorage.setItem(`${TOLD}.${problem.fix}`, '1');
      Shell.toast(offer[0], { action: { label: offer[1], run: () => offer[2]().catch(() => {}) } });
    }
  }
  function describe(e) {
    const where = whereOf(rec);
    if (e instanceof SharePoint.AuthError && e.interactive !== false) return { text: 'Signed out of SharePoint: changes are kept in this browser', tone: 'busy', fix: 'sign-in' };
    if (e.fix === 'allow' || e.name === 'NotAllowedError') return { text: 'No access to the file: changes are kept in this browser', tone: 'busy', fix: 'allow' };
    if (e.fix === 'open') return { text: e.message, tone: 'error', fix: 'open' };
    if (e instanceof TypeError && /fetch|network|offline/i.test(e.message)) return { text: 'Offline: changes are kept in this browser', tone: 'busy' };
    if (e instanceof SharePoint.NotFoundError || e.name === 'NotFoundError') return { text: `Couldn’t find the workbook in ${where}`, tone: 'error', fix: 'open' };
    return { text: `Couldn’t ${op} ${where}: ${String(e.message ?? e).replace(/\.$/, '')}`, tone: 'error', fix: 'retry' };
  }

  // ---- Saying how it stands ----

  function ago(stamp) {
    const min = stamp ? Math.round((Date.now() - new Date(stamp)) / 60000) : 0;
    return min < 1 ? 'just now' : min < 60 ? `${min} min ago` : min < 1440 ? `${Math.round(min / 60)} h ago`
      : new Date(stamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }
  // How it stands, as the sidebar says it: { text, tone, fix }, tone '', 'busy' or 'error'.
  function status() {
    rec = read();
    if (rec.place === 'browser') return problem ?? { text: 'Saved in this browser', tone: '' };
    const where = whereOf(rec);
    if (rec.conflict) return { text: `Not saved: ${rec.conflict.by ? `${rec.conflict.by} saved a newer version` : `${where} changed since`}`, tone: 'error', fix: 'conflict' };
    if (problem) return problem;
    if (showSaving) return { text: `Saving to ${where}…`, tone: 'busy' };
    // Kept together where the sidebar wraps it: "Saved to Fund Legal ›" over "Rboreal · 2 min ago".
    return { text: `Saved to ${where}${NBSP}·${NBSP}${ago(rec.at).replaceAll(' ', NBSP)}`, tone: '' };
  }
  const NBSP = String.fromCharCode(160);   // a space that a line doesn't break at
  const listeners = [];
  function report() {
    const s = status();
    if (typeof Shell !== 'undefined') Shell.setStatus(s.text, s.tone);
    for (const fn of listeners) fn(s);
  }
  const tell = text => { if (typeof Shell !== 'undefined' && Shell.page) Shell.toast(text); };

  // ---- Choosing where it's kept ----
  // Opening a workbook from a place makes it the working copy; `confirm` is asked first, with what's
  // there ({ name, at, by }), and can decline. Saving to a place puts the working copy there, and keeps it
  // there from then on. An action fails with an Error whose message says why, in plain words.

  function useBrowser() {
    keep({ place: 'browser' });
    problem = null;
    keepHandle(null);
    report();
  }

  async function openFile({ confirm = async () => true } = {}) {
    let h;
    try { [h] = await showOpenFilePicker({ types: FILE_TYPES }); } catch (e) { if (e.name === 'AbortError') return null; throw e; }
    const file = await h.getFile();
    const text = await file.text();
    parseWorkbook(text, file.name);
    if (!await confirm({ name: file.name, at: iso(file.lastModified), by: null })) return null;
    // The picker gave leave to read; saving needs leave to write, asked now, while there's a click to ask on.
    try { await h.requestPermission({ mode: 'readwrite' }); } catch {}
    await keepHandle(h);
    keep({ place: 'file', name: file.name });
    adopt(text, { version: file.lastModified, at: iso(file.lastModified), by: null });
    return file.name;
  }
  // `suggested` names the new file.
  async function saveFileAs(suggested = `${workbookName()}.rboreal.json`) {
    let h;
    try { h = await showSaveFilePicker({ suggestedName: suggested, types: FILE_TYPES }); } catch (e) { if (e.name === 'AbortError') return null; throw e; }
    const body = contentOf(workingText());
    const w = await h.createWritable();
    await w.write(body);
    await w.close();
    const file = await h.getFile();
    await keepHandle(h);
    keep({ place: 'file', name: file.name, version: file.lastModified, synced: hash(body), at: iso(file.lastModified), by: null, checked: Date.now() });
    problem = null;
    report();
    return file.name;
  }
  // After a page has opened, leave to write to the file has to be asked for again, on a click.
  async function allowFile() {
    await fileHandle({ ask: true });
    problem = null;
    return sync({ look: true });
  }

  async function openLibrary(name, { confirm = async () => true } = {}) {
    name = clean(name);
    const path = connector().workbookPath(name);
    await needSignIn();
    let got;
    try { got = await connector().loadWorkbook(path); } catch (e) {
      if (e instanceof SharePoint.NotFoundError) throw new StoreError(`There’s no workbook called ${name} in ${libraryName()}.`);
      throw e;
    }
    parseWorkbook(got.json, name);
    if (!await confirm({ name, at: got.item.lastModified, by: got.item.lastModifiedBy })) return null;
    keep({ place: 'sharepoint', name, path });
    adopt(got.json, { version: got.eTag, at: got.item.lastModified, by: got.item.lastModifiedBy });
    return name;
  }
  async function saveLibraryAs(name) {
    name = clean(name);
    const path = connector().workbookPath(name);
    await needSignIn();
    const body = contentOf(workingText());
    let got;
    // Saving without a version is refused where a workbook is already, so this never saves over one.
    try { got = await connector().saveWorkbook(path, body); } catch (e) {
      if (e instanceof SharePoint.ConflictError) throw new StoreError(`There’s already a workbook called ${name} in ${libraryName()}. Open it, or choose another name.`);
      throw e;
    }
    keep({ place: 'sharepoint', name, path, version: got.eTag, synced: hash(body), at: got.item.lastModified ?? new Date().toISOString(), by: got.item.lastModifiedBy ?? null, checked: Date.now() });
    problem = null;
    report();
    return name;
  }
  // A name for the workbook where none has been given: its one chart's, or a plain one.
  const workbookName = () => rec.place === 'sharepoint' ? rec.name
    : rec.place === 'file' ? rec.name.replace(/(\.rboreal)?\.json$/i, '')
    : workbook.charts.length === 1 ? chartInUse().name : 'Rboreal workbook';

  // ---- A conflict ----
  // Both copies are kept until one of these: take theirs, keep mine (saving it over theirs, which stays in
  // SharePoint's version history), or save mine as a copy, leaving theirs as it is.

  async function takeTheirs() {
    const theirs = await places[rec.place].load(rec);
    adopt(theirs.text, theirs);
    report();
  }
  async function keepMine() {
    // Saved over the copy as it is now, which may be newer than the one that conflicted.
    const theirs = await places[rec.place].load(rec);
    update({ version: theirs.version, conflict: null, synced: null });
    return sync();
  }
  const saveMineAs = name => rec.place === 'file' ? saveFileAs() : saveLibraryAs(name);

  // ---- Signing in to SharePoint ----

  async function signIn() {
    const account = await connector().signIn();
    if (connector().isDemo()) sessionStorage.setItem(DEMO_SESSION, '1');
    problem = null;
    sync({ look: true });
    return account;
  }
  async function signOut() {
    await connector().signOut();
    sessionStorage.removeItem(DEMO_SESSION);
    if (rec.place === 'sharepoint') problem = describe(new SharePoint.AuthError('Signed out.'));
    report();
  }
  // Settings for the connector (see sharepoint.js's configure). If they point at another library, the
  // workbook is kept in this browser until it's opened or saved there.
  function configure(changes) {
    const was = libraryKey();
    const config = connector().configure(changes);
    if (libraryKey() !== was) {
      sessionStorage.removeItem(DEMO_SESSION);
      if (rec.place === 'sharepoint') useBrowser();
    }
    report();
    return config;
  }
  const libraryKey = () => { const c = connector().config(); return [connector().mode(), c.tenantId, c.siteUrl, c.library, c.workbookFolder].join('|'); };

  // ---- Copies: export and import ----

  // Downloads the workbook as one JSON file, every chart with its views and history.
  function exportWorkbook() {
    const name = `${workbookName()} ${new Date().toISOString().slice(0, 10)}.rboreal.json`.replace(/[\\/:*?"<>|]+/g, '-');
    download(new Blob([contentOf(workingText())], { type: 'application/json' }), name);
    return name;
  }
  function download(blob, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }
  // A workbook file the person picked, read and checked: { name, text, workbook }.
  async function readFile(file) {
    const text = await file.text();
    return { name: file.name, text, workbook: parseWorkbook(text, file.name) };
  }

  // Brings a workbook's charts into this one. A chart that's here too (the same chart, by its id) has its
  // data replaced, as one undoable step of that chart, recorded in its history; `asNew` adds every chart as
  // a new one instead. A new chart brings its own history, with the import noted at its head. Charts here
  // that the file lacks are left alone, so an import never loses one. Returns the charts' names, by what
  // happened to them: { replaced, added }.
  function importWorkbook(wb, { source, asNew = false }) {
    const back = workbook.chartId, here = new Set(workbook.charts.map(c => c.id));
    const summary = `Imported from ${source}`;
    const out = { replaced: [], added: [] };
    for (const c of wb.charts) {
      if (!asNew && here.has(c.id)) {
        switchChart(c.id);
        replaceState(structuredClone(c.state), summary, 'import');
        out.replaced.push(chartInUse().name);
      } else {
        addChart(c.name, structuredClone(c.state), asNew ? {} : { id: c.id, ...(c.sample ? { sample: true } : {}) });
        noteChange(summary, [], 'import');
        saveState();
        out.added.push(chartInUse().name);
      }
    }
    switchChart(back);
    return out;
  }
  // Opens a downloaded copy where files can't be kept open: it becomes the working copy, kept in this browser.
  function openCopy(text, name) {
    parseWorkbook(text, name);
    keep({ place: 'browser' });
    adopt(text, {});
  }

  // What replacing the working copy would lose: 'workbook' where this browser holds the only copy and it
  // has been changed, 'changes' where changes haven't been saved to the place yet, or null.
  function atRisk() {
    rec = read();
    if (rec.place !== 'browser') return unsaved() ? 'changes' : null;
    return [...currentCharts(), ...workbook.deleted].some(c => c.state.history?.length) ? 'workbook' : null;
  }
  // Forgets the workbook in this browser, and where it was kept; the copy there stays. The sample takes its
  // place. Your name, the theme and the SharePoint settings stay too.
  function clearBrowserCopy() {
    localStorage.removeItem(WORKBOOK_KEY);
    useBrowser();
    reread();
  }

  // ---- When it looks ----

  function changed(saved = true) {
    if (!saved) { problem = { text: 'Couldn’t save: this browser’s storage is full', tone: 'error' }; return report(); }
    if (rec.place === 'browser') { if (problem) { problem = null; report(); } return; }
    clearTimeout(timer);
    timer = setTimeout(sync, SAVE_AFTER);
  }

  document.addEventListener('DOMContentLoaded', () => { report(); sync(); });
  addEventListener('online', () => sync());
  document.addEventListener('visibilitychange', () => {
    // Leaving: a change waiting to be saved goes now. Back: anything saved elsewhere meanwhile comes in.
    if (document.visibilityState === 'hidden') { if (timer) sync(); }
    else sync();
  });
  // Another tab moved where it's kept, or saved.
  addEventListener('storage', e => { if (e.key === KEY) { rec = read(); handle = null; report(); } });
  setInterval(report, 30000);

  return {
    changed, status, sync, onChange: fn => listeners.push(fn),
    // Where it's kept: the record, with `where` naming the place ("Fund Legal › Rboreal").
    place: () => { rec = read(); return { ...rec, where: whereOf(rec) }; },
    libraryName, canUseFiles, unsaved: () => unsaved(), atRisk, workbookName,
    useBrowser, openFile, saveFileAs, allowFile, openLibrary, saveLibraryAs, openCopy,
    takeTheirs, keepMine, saveMineAs,
    signIn, signOut, isSignedIn: signedIn, configure,
    exportWorkbook, readFile, importWorkbook, clearBrowserCopy,
  };
})();
