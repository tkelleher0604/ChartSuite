// Store: where the workbook open in this tab is kept (dendra.md, Change). Every change is appended to this
// browser's IndexedDB as it's made, and other tabs open on the workbook take it in at once. A workbook kept
// in a file or a SharePoint library is saved there too, the same way for both: read the copy there, take
// the union, and write it back naming the version read; if someone saved in between, read again and repeat.
// A union loses nothing, so there's never anything to choose; what it can leave is rows that disagree (Log's).
//
// One global, `Store`, with nothing on the page:
//   Store.open({ id?, sample? }) → the workbook (core/README.md) last open in this browser, or the one with
//     that id; where there's none, a new one in this browser, holding the sample's changes
//   Store.openFile(file?) → the workbook kept in a file; Store.books() → those this browser keeps, latest first
//   Store.saveAs('file' | 'library', name?), Store.download(name?): keep it there from now on, or a copy
//   Store.status() → { text, tone: '' | 'busy' | 'error', fix?: 'allow' | 'sign-in', detail? }; Store.fix()
//     does what `fix` says, on a click; Store.subscribe(fn) → unsubscribe, fn(status) when it changes
//   Store.where() → { id, type: 'browser' | 'file' | 'sharepoint', name }; Store.sync(): now
//   Store.who(): the Microsoft account signed in, or else the name set in Settings
// Load vendor/dexie and the core first, and for SharePoint vendor/msal and sharepoint.js.
const Store = (() => {
// The database is the page's own, or the one its script tag names (data-db), as a test's is.
const db = new Dexie(document.currentScript?.dataset.db || 'dendra');
db.version(1).stores({ changes: '[book+id], book', books: 'id, opened' });
const SAVE_AFTER = 1500, LOOK_EVERY = 20000;
const TYPES = [{ description: 'Dendra workbook', accept: { 'application/json': ['.json'] } }];
const canKeepFiles = typeof showOpenFilePicker === 'function';
const sp = () => typeof SharePoint === 'undefined' ? null : SharePoint;
const now = () => new Date().toISOString();

// The file is the log, a change to a line, so it reads and compares change by change.
const text = changes => `{"dendra":1,"changes":[\n${changes.map(c => JSON.stringify(c)).join(',\n')}\n]}\n`;
function logOf(body, name) {
  let data = null;
  try { data = JSON.parse(body); } catch {}
  if (!data?.dendra || !Array.isArray(data.changes)) throw Object.assign(new Error(`${name} isn’t a Dendra workbook.`), { notLog: true });
  return data;
}
const bare = name => String(name).replace(/(\.dendra)?\.json$/i, '');

// ---- The places outside this browser ----
// Each reads its copy as { version, modified }, with its `text` unless that version is the one `known`,
// or null if there's nothing there yet; and writes one if it's still the version named, or else throws
// `stale`. A SharePoint file's version is its eTag, and a file's its last-modified time.

const stale = () => Object.assign(new Error('Saved there since.'), { stale: true });
async function access(book) {
  const h = book.handle;
  if (typeof h?.getFile !== 'function') throw Object.assign(new Error('This browser no longer has the file.'), { name: 'NotFoundError' });
  if (await h.queryPermission({ mode: 'readwrite' }) !== 'granted') throw Object.assign(new Error('Allow Dendra to save to this file.'), { name: 'NotAllowedError' });
  return h;
}
const stamp = f => ({ version: f.lastModified, modified: new Date(f.lastModified).toISOString() });
const places = {
  file: {
    async read(book, known) {
      const f = await (await access(book)).getFile();
      return f.lastModified === known ? stamp(f) : f.size ? { ...stamp(f), text: await f.text() } : null;
    },
    // A file can't be written on condition, so it's checked before the write, again just before the write
    // replaces it, and read back after: another write can land in between, and then this one is made again.
    async write(book, body, version) {
      const h = await access(book), f = await h.getFile();
      if (version == null ? f.size > 0 : f.lastModified !== version) throw stale();
      const w = await h.createWritable();
      await w.write(body);
      if ((await h.getFile()).lastModified !== f.lastModified) { await w.abort(); throw stale(); }
      await w.close();
      const now = await h.getFile();
      if (await now.text() !== body) throw stale();
      return stamp(now);
    },
  },
  sharepoint: {
    read: (book, known) => SharePoint.read(book.file, known),
    write: (book, body, version) => SharePoint.write(book.file, body, version),
  },
};

// ---- Saying how it stands ----

function ago(iso) {
  const min = Math.round((Date.now() - Date.parse(iso)) / 60000);
  return min < 1 ? 'just now' : min < 60 ? `${min} min ago` : min < 1440 ? `${Math.round(min / 60)} h ago`
    : new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
// What stopped a save, in a few words. Whatever it was, every change is still kept in this browser.
function describe(e) {
  if (e.name === 'NotAllowedError') return { text: 'Needs access · kept here', tone: 'busy', fix: 'allow' };
  if (e.status === 401) return { text: 'Signed out · kept here', tone: 'busy', fix: 'sign-in' };
  if (!navigator.onLine || (e.name === 'TypeError' && /fetch|network/i.test(e.message)) || /network/i.test(e.errorCode ?? ''))
    return { text: 'Offline · kept here', tone: 'busy' };
  if (e.notLog) return { text: 'Not a Dendra workbook', tone: 'error', detail: e.message };
  if (e.status === 403) return { text: 'No access · kept here', tone: 'error', detail: e.message };
  if (e.status === 404 || e.name === 'NotFoundError') return { text: 'Moved or deleted · kept here', tone: 'error', detail: e.message };
  return { text: 'Not saved · kept here', tone: 'error', detail: e.message };
}
const unkept = e => ({ text: [e?.name, e?.inner?.name].includes('QuotaExceededError') ? 'Not kept · browser storage is full'
  : 'Not kept · browser storage is off', tone: 'error', detail: e?.message });

// ---- The workbook open in this tab ----
// A book is a workbook as this browser keeps it: { id, type, name, handle (a file's), file (SharePoint's),
// opened }. Its changes are in IndexedDB under its id, so workbooks kept in different places never mix.

let s = null;
const listeners = new Set();
const status = () => s ? s.status() : { text: 'Opening…', tone: 'busy' };
const emit = () => { const st = status(); listeners.forEach(f => f(st)); };

async function session(book, seed) {
  const channel = new BroadcastChannel(`dendra ${book.id}`), early = [];
  channel.onmessage = e => early.push(e.data);
  let rows = [], local = null;
  book.opened = now();
  try { await db.books.put(book); rows = await db.changes.where('book').equals(book.id).toArray(); } catch (e) { local = unkept(e); }
  const wb = Log.open(rows.map(r => r.change));
  const known = new Set(wb.changes().map(c => c.id));
  const remote = () => book.type !== 'browser';
  // `seen` is the copy there as last read or written: its version, when it was saved, and its changes.
  let seen = null, problem = null, saving = false, writing = 0, keptAt = book.opened;
  let timer = null, running = null, again = false, pulling = false, self = null;
  const tell = () => { if (s === self) emit(); };
  const where = () => ({ id: book.id, type: book.type, name: book.name });

  // In this browser: each new change is appended, and the other tabs told.
  function keep(changes) {
    writing++;
    db.changes.bulkPut(changes.map(c => ({ book: book.id, id: c.id, change: c })))
      .then(() => { keptAt = now(); local = null; }, e => { local = unkept(e); })
      .finally(() => { writing--; tell(); });
  }
  const off = wb.subscribe(cs => {
    const fresh = cs.filter(c => !known.has(c.id));
    if (fresh.length) {
      fresh.forEach(c => known.add(c.id));
      keep(fresh);
      channel.postMessage({ changes: fresh });
      if (!pulling) later();
    }
    tell();
  });
  // Another tab made changes, which it has kept, or moved where the workbook is kept.
  async function hear(m) {
    if (m.changes) { m.changes.forEach(c => known.add(c.id)); wb.merge(m.changes); }
    if (m.book) {
      await running;
      const b = await db.books.get(book.id).catch(() => null);
      if (b) { Object.assign(book, b); seen = problem = null; sync(); }
    }
  }

  // Elsewhere: read, union, write, after a pause in the changes, and every so often to bring others' in.
  function later() { if (remote()) { clearTimeout(timer); timer = setTimeout(sync, SAVE_AFTER); } }
  function sync() {
    clearTimeout(timer);
    if (!remote()) return Promise.resolve();
    if (running) { again = true; return running; }
    return running = (async () => { do { again = false; await step(); } while (again); running = null; })();
  }
  // A SharePoint file named by its folder and name is named by its id once it's there.
  const learn = got => {
    if (got?.id && book.file && book.file.id !== got.id) { book.file = { drive: book.file.drive, id: got.id }; db.books.put(book).catch(() => {}); }
  };
  async function step() {
    const place = places[book.type];
    try {
      for (let tries = 0; tries < 10; tries++) {
        const got = await place.read(book, seen?.version);
        learn(got);
        if (got?.text !== undefined) {
          const there = logOf(got.text, book.name);
          pulling = true;
          try { wb.merge(there); } finally { pulling = false; }
          seen = { version: got.version, modified: got.modified, count: new Set(there.changes.map(c => c.id)).size };
        } else if (!got) seen = { version: null, modified: null, count: 0 };
        const changes = wb.changes();
        if (changes.length <= seen.count) { problem = null; return; }
        saving = true;
        tell();
        try {
          const put = await place.write(book, text(changes), seen.version);
          learn(put);
          seen = { version: put.version, modified: put.modified, count: changes.length };
          problem = null;
          return;
        } catch (e) { if (!e.stale) throw e; seen = null; } finally { saving = false; }
      }
      throw new Error('It kept changing as it was saved.');
    } catch (e) { problem = describe(e); } finally { tell(); }
  }

  // Every so often the status is said again, since it says how long ago, and others' changes looked for.
  const poll = setInterval(() => { tell(); if (document.visibilityState === 'visible') sync(); }, LOOK_EVERY);
  // Back online, or back to the tab, others' changes come in; leaving it, a change waiting goes now.
  addEventListener('online', sync);
  document.addEventListener('visibilitychange', sync);

  self = {
    wb, where, sync,
    status() {
      if (local) return local;
      if (problem) return problem;
      if (saving || writing || (remote() && (!seen || wb.changes().length > seen.count))) return { text: 'Saving…', tone: 'busy' };
      const at = remote() ? seen.modified : keptAt;
      return { text: at ? `Saved · ${ago(at)}` : 'Saved', tone: '' };
    },
    async fix() {
      if (book.type === 'file') await book.handle?.requestPermission?.({ mode: 'readwrite' });
      if (book.type === 'sharepoint') await SharePoint.signIn();
      problem = null;
      await sync();
      return self.status();
    },
    // From now on, kept in a file or the library, which the first save joins if there's a workbook there.
    async saveAs(type, name = book.name) {
      if (type === 'file') {
        if (!canKeepFiles) return self.download(name);
        let h;
        try { h = await showSaveFilePicker({ suggestedName: `${name}.dendra.json`, types: TYPES }); } catch (e) { if (e.name === 'AbortError') return null; throw e; }
        const f = await h.getFile();
        // A file there that isn't a workbook, the person has chosen to replace.
        if (f.size) try { logOf(await f.text(), h.name); } catch { const w = await h.createWritable(); await w.close(); }
        await running;
        Object.assign(book, { type, handle: h, file: null, name: bare(h.name) });
      } else {
        const lib = await SharePoint.library(), clean = Tree.clean(name).replace(/["*:<>?/\\|]+/g, '-') || 'Workbook';
        await running;
        Object.assign(book, { type: 'sharepoint', handle: null, file: { drive: lib.drive, parent: lib.id, name: `${clean}.dendra.json` }, name: clean });
      }
      seen = problem = null;
      await db.books.put(book).catch(() => {});
      channel.postMessage({ book: true });
      await sync();
      return self.status();
    },
    // A copy, as a file: where files can't be kept open, this is how one is saved.
    download(name = book.name) {
      const a = Object.assign(document.createElement('a'),
        { href: URL.createObjectURL(new Blob([text(wb.changes())], { type: 'application/json' })), download: `${name}.dendra.json` });
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 10000);
      return null;
    },
    close() {
      off();
      clearInterval(poll);
      clearTimeout(timer);
      removeEventListener('online', sync);
      document.removeEventListener('visibilitychange', sync);
      channel.close();
    },
  };
  channel.onmessage = e => hear(e.data);
  early.forEach(hear);
  if (seed) wb.merge(seed);
  if (!book.name) { book.name = wb.charts()[0]?.name ?? 'Workbook'; db.books.put(book).catch(() => {}); }
  sync();
  return self;
}

async function use(book, seed) {
  const next = await session(book, seed);
  s?.close();
  s = next;
  emit();
  return s.wb;
}
async function open({ id, sample } = {}) {
  await sp()?.ready();
  let book = null;
  try { book = id ? await db.books.get(id) : await db.books.orderBy('opened').last(); } catch {}
  return use(book ?? { id: id ?? Log.newId(), type: 'browser' }, book ? null : sample);
}
// A workbook file: kept open where the browser can (the file opened is saved from then on), and otherwise,
// or for a file given (dropped, say), a copy opened in this browser.
async function openFile(file) {
  if (file || !canKeepFiles) {
    file ??= await choose();
    return file && use({ id: Log.newId(), type: 'browser', name: bare(file.name) }, logOf(await file.text(), file.name));
  }
  let h;
  try { [h] = await showOpenFilePicker({ types: TYPES }); } catch (e) { if (e.name === 'AbortError') return null; throw e; }
  const f = await h.getFile(), seed = f.size ? logOf(await f.text(), h.name) : null;
  // The picker gave leave to read; saving needs leave to write, asked now, while the click lasts.
  await h.requestPermission({ mode: 'readwrite' }).catch(() => {});
  for (const b of await db.books.toArray().catch(() => []))
    if (b.type === 'file' && await b.handle?.isSameEntry?.(h)) return use({ ...b, handle: h }, seed);
  return use({ id: Log.newId(), type: 'file', handle: h, name: bare(h.name) }, seed);
}
const choose = () => new Promise(resolve => {
  const input = Object.assign(document.createElement('input'), { type: 'file', accept: '.json,application/json' });
  input.onchange = () => resolve(input.files[0] ?? null);
  input.oncancel = () => resolve(null);
  input.click();
});

const books = async () => (await db.books.orderBy('opened').reverse().toArray().catch(() => []))
  .map(b => ({ id: b.id, type: b.type, name: b.name, opened: b.opened }));

function who() {
  try { return sp()?.account()?.name || localStorage.getItem('dendra.name') || null; } catch { return null; }
}

return {
  open, openFile, books,
  get wb() { return s?.wb ?? null; },
  where: () => s?.where() ?? null,
  status, subscribe: fn => (listeners.add(fn), () => listeners.delete(fn)),
  sync: () => s ? s.sync() : Promise.resolve(),
  fix: () => s?.fix(),
  saveAs: (type, name) => s.saveAs(type, name),
  download: name => s.download(name),
  who,
};
})();
