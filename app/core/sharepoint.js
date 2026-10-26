// SharePoint: what a link to a document is, and the library a team keeps its documents and workbooks in.
//
// One global, `SharePoint`, with nothing on the page:
// - parse(link): what a link points at, from the link alone; href(link) and open(link) to follow it;
// - settings: the tenant, the app's client id and the library's address, kept in this browser;
// - signing in through MSAL (vendor/msal), and Microsoft Graph as the person signed in: browse, search,
//   an item's details, Microsoft's File Picker for linking a document, and read and write for the store.
//
// Signing in and the picker need the page served over https (or from localhost): Entra ID sends a sign-in
// back only to an address registered for it, and a file has none. See docs/sharepoint-setup.md.
const SharePoint = (() => {

// ---- Links ----

const KINDS = { doc: 'word', docx: 'word', docm: 'word', dot: 'word', dotx: 'word', rtf: 'word', pdf: 'pdf',
  xls: 'excel', xlsx: 'excel', xlsm: 'excel', xlsb: 'excel', csv: 'excel', ppt: 'powerpoint', pptx: 'powerpoint',
  pptm: 'powerpoint', msg: 'email', eml: 'email' };
// A modern SharePoint link says what it is after its first colon, /:w:/ for Word, and a sharing link
// says nothing else: :b: is any other file, most often a PDF.
const LETTERS = { w: 'word', x: 'excel', p: 'powerpoint', b: 'pdf', f: 'folder' };
const WORDS = { word: 'Word document', pdf: 'PDF', excel: 'Spreadsheet', powerpoint: 'Presentation', email: 'Email', folder: 'Folder', other: 'File' };
const SYSTEMS = { sharepoint: 'SharePoint', onedrive: 'OneDrive', edgar: 'EDGAR', netdocuments: 'NetDocuments', imanage: 'iManage', file: 'File share', web: 'Web' };
const decode = s => { try { return decodeURIComponent(s); } catch { return s; } };
const extension = name => /\.([a-z][a-z0-9]{1,4})$/i.exec(name ?? '')?.[1].toLowerCase() ?? null;
// A file's name ends in an extension, and a web page's (Doc.aspx, index.htm) names no document.
const fileName = s => extension(s) && !/^(aspx?|html?|php|jsp|cgi)$/.test(extension(s)) ? s : null;
const kindOf = name => KINDS[extension(name)] ?? 'other';

// What a link points at: { link, system, kind, name, id, short, host, site, library, folder, sharing }.
// `system` is sharepoint, onedrive, edgar, netdocuments, imanage, file or web, or null if it isn't a link.
// `name` is the file's name where the link gives one; `id` the document's number in a system that has one
// (an EDGAR accession number, a NetDocuments or iManage number); `short` what the link is called where
// there's little room. For SharePoint, `site` is the site's path (/sites/FundLegal), `library` the library
// as the address spells it (Shared Documents), `folder` the folders below it, joined by /, and `sharing`
// says it's a sharing link, which names no file.
function parse(link) {
  const text = String(link ?? '').trim();
  const p = { link: text, system: null, kind: 'other', name: null, id: null, short: text, host: null, site: null, library: null, folder: '', sharing: false };
  if (/^iwl:/i.test(text)) {
    const q = Object.fromEntries(text.slice(4).split('&&').map(kv => kv.split('=')));
    return finish({ ...p, system: 'imanage', id: q.num ? `${q.num}${q.ver ? `v${q.ver}` : ''}` : null });
  }
  if (/^\\\\|^file:/i.test(text)) {
    const parts = text.replace(/^file:\/*/i, '').split(/[\\/]+/).filter(Boolean).map(decode), name = fileName(parts.at(-1));
    return finish({ ...p, system: 'file', host: parts[0] ?? null, name, folder: parts.slice(1, name ? -1 : undefined).join('/') });
  }
  let u;
  try { u = new URL(text); } catch { return p; }
  if (!/^https?:$/.test(u.protocol)) return p;
  const host = u.hostname.toLowerCase(), segs = u.pathname.split('/').filter(Boolean).map(decode);
  Object.assign(p, { system: 'web', host });

  if (/(^|\.)sec\.gov$/.test(host)) {
    const accession = segs.map(s => /^\d{18}$/.test(s) ? `${s.slice(0, 10)}-${s.slice(10, 12)}-${s.slice(12)}` : /^\d{10}-\d{2}-\d{6}/.exec(s)?.[0]).find(Boolean);
    const cik = u.searchParams.get('CIK') ?? u.searchParams.get('cik') ?? (/^data$/i.test(segs[2] ?? '') ? segs[3] : null);
    const last = segs.at(-1);
    return finish({ ...p, system: 'edgar', name: extension(last) && !/-index\.html?$/i.test(last) ? last : null,
      id: accession ?? (cik ? `CIK ${cik}` : null) });
  }
  if (/(^|\.)(netvoyage|netdocuments)\.(com|net)$/.test(host))
    return finish({ ...p, system: 'netdocuments', id: u.searchParams.get('id') ?? /\d{4}-\d{4}-\d{4}/.exec(u.pathname)?.[0] ?? null });
  if (/(^|\.)(imanage\.work|cloudimanage\.com)$/.test(host)) {
    const m = /[\w-]+!(\d+)(?:\.(\d+))?/.exec(decode(u.pathname + u.search));
    return finish({ ...p, system: 'imanage', id: m ? `${m[1]}${m[2] ? `v${m[2]}` : ''}` : null });
  }
  const onedrive = /-my\.sharepoint(-df)?\.(com|us|de|cn)$/.test(host);
  if (!/\.sharepoint(-df)?\.(com|us|de|cn)$/.test(host) && !segs.some(s => /^_layouts$/i.test(s))) {
    if (/(^|\.)onedrive\.live\.com$|(^|\.)1drv\.ms$/.test(host)) return finish({ ...p, system: 'onedrive', sharing: true });
    return finish({ ...p, name: fileName(segs.at(-1)) });
  }
  p.system = onedrive ? 'onedrive' : 'sharepoint';
  let s = segs;

  // A modern link: /:w:/r/sites/X/Library/… spells out the path; /:b:/s/X/token is a sharing link, which
  // names no file, as is /:w:/g/personal/user/token on OneDrive.
  const modern = /^:([a-z]):$/i.exec(s[0] ?? '');
  if (modern) {
    const how = (s[1] ?? '').toLowerCase();
    s = s.slice(2);
    if (how !== 'r') {
      const site = /^(sites|teams|personal)$/i.test(s[0] ?? '') ? `/${s[0]}/${s[1] ?? ''}` : s.length > 1 ? `/${how === 't' ? 'teams' : 'sites'}/${s[0]}` : null;
      return finish({ ...p, sharing: true, site, kind: LETTERS[modern[1].toLowerCase()] ?? 'other' });
    }
  }
  // A page of SharePoint's own names the file in its query: Doc.aspx?…&file=Name.docx, or a library
  // view's AllItems.aspx?id=/sites/X/Library/Folder/File.pdf.
  const id = u.searchParams.get('id'), file = u.searchParams.get('file');
  const page = s.some(x => /^_layouts$/i.test(x)) || /\.aspx$/i.test(s.at(-1) ?? '');
  if (page && id) s = id.split('/').filter(Boolean);
  else if (page) {
    const at = s.findIndex(x => /^_layouts$/i.test(x));
    s = at >= 0 ? s.slice(0, at) : s.slice(0, -1);
    if (/^forms$/i.test(s.at(-1) ?? '')) s = s.slice(0, -1);
  }
  if (/^(sites|teams|personal)$/i.test(s[0] ?? '')) { p.site = `/${s[0]}/${s[1] ?? ''}`; s = s.slice(2); }
  p.library = s[0] ?? null;
  const rest = s.slice(1), named = fileName(rest.at(-1));
  p.name = named ?? (page && file ? file : null);
  p.folder = (named ? rest.slice(0, -1) : rest).join('/');
  if (!p.name) p.kind = 'folder';
  return finish(p);
}
function finish(p) {
  if (p.name) p.kind = kindOf(p.name);
  p.short = p.id ? `${SYSTEMS[p.system]} ${p.id}` : p.name
    ?? (p.sharing ? `${WORDS[p.kind]} in ${SYSTEMS[p.system]}` : p.folder ? p.folder.split('/').pop() : p.library ?? p.host ?? p.link);
  return p;
}

// An address a browser can follow: a file share's path as a file: URL, and anything else as it is.
const href = link => /^\\\\/.test(link)
  ? `file:${link.replace(/\\/g, '/').split('/').map((s, i) => i < 3 ? s : encodeURIComponent(s)).join('/')}` : link;
const open = link => window.open(href(link), '_blank', 'noopener');

// ---- Settings ----
// The directory (tenant) id, the app registration's client id, and the address of the library or folder
// workbooks are kept in, as the browser shows it. Kept in this browser; none is a secret.

const KEY = 'dendra.sharepoint';
function settings() {
  try { return { tenant: '', client: '', library: '', ...JSON.parse(localStorage.getItem(KEY)) }; } catch { return { tenant: '', client: '', library: '' }; }
}
function configure(changes) {
  const s = { ...settings(), ...changes };
  localStorage.setItem(KEY, JSON.stringify(s));
  app = lib = me = null;
  return s;
}
const configured = () => { const s = settings(); return !!(s.tenant && s.client && s.library); };

// ---- Signing in ----

const SCOPES = ['User.Read', 'Files.ReadWrite.All', 'Sites.Read.All'];
class SharePointError extends Error {
  constructor(message, status, code) { super(message); this.name = 'SharePointError'; this.status = status; this.code = code; }
}
let app = null, me = null;
// MSAL, once: it finishes a sign-in that came back by redirect, and remembers the account in this browser.
function msalApp() {
  if (!app) {
    const s = settings();
    if (!s.tenant || !s.client) return Promise.reject(new SharePointError('SharePoint isn’t set up.', 0));
    const pca = new msal.PublicClientApplication({
      auth: { clientId: s.client, authority: `https://login.microsoftonline.com/${s.tenant}`, redirectUri: location.origin + location.pathname },
      cache: { cacheLocation: 'localStorage' },
    });
    app = pca.initialize().then(() => pca.handleRedirectPromise()).then(r => { if (r?.account) pca.setActiveAccount(r.account); return pca; });
    app.catch(() => { app = null; });
  }
  return app;
}
const accountOf = p => p.getActiveAccount() ?? p.getAllAccounts()[0] ?? null;
// Learns who's signed in, if anyone, so that account() can say.
const ready = () => configured() ? msalApp().then(p => { me = accountOf(p); }, () => {}) : Promise.resolve();
const account = () => me && { name: me.name || me.username, username: me.username };

// On a click: a popup, or the whole page where popups are blocked, which comes back signed in.
async function signIn() {
  const p = await msalApp(), request = { scopes: SCOPES, prompt: 'select_account' };
  let r;
  try { r = await p.loginPopup(request); } catch (e) {
    if (!/popup_window_error|empty_window_error/.test(e.errorCode)) throw e;
    await p.loginRedirect(request);
    return new Promise(() => {});
  }
  p.setActiveAccount(r.account);
  me = r.account;
  return account();
}
async function signOut() {
  const p = await msalApp(), a = accountOf(p);
  me = null;
  if (a) await p.logoutPopup({ account: a });
}
// A token for Graph (or for SharePoint itself, for the picker), silently: what needs a click is signing in.
async function token(scopes = SCOPES) {
  const p = await msalApp(), a = accountOf(p);
  if (!a) throw new SharePointError('Signed out.', 401);
  try { return (await p.acquireTokenSilent({ scopes, account: a })).accessToken; } catch (e) {
    if (e instanceof msal.InteractionRequiredAuthError) throw new SharePointError('Signed out.', 401);
    throw e;
  }
}

// ---- Graph ----

const GRAPH = 'https://graph.microsoft.com/v1.0';
async function graph(path, { method = 'GET', body, headers } = {}) {
  for (let tries = 1; ; tries++) {
    const res = await fetch(path.startsWith('https:') ? path : GRAPH + path,
      { method, body, headers: { Authorization: `Bearer ${await token()}`, ...headers } });
    if (res.ok) return res.status === 204 ? null : res.json();
    if ((res.status === 429 || res.status === 503) && tries < 4) {
      await new Promise(r => setTimeout(r, 1000 * Math.min(Number(res.headers.get('Retry-After')) || tries, 10)));
      continue;
    }
    const error = (await res.json().catch(() => null))?.error;
    throw new SharePointError(error?.message || `SharePoint answered ${res.status}.`, res.status, error?.code);
  }
}
// Every page of a collection.
async function all(path) {
  const out = [];
  for (let page = await graph(path), n = 0; ; page = await graph(page['@odata.nextLink'])) {
    out.push(...page.value);
    if (!page['@odata.nextLink'] || ++n > 50) return out;
  }
}
const encodePath = path => path.split('/').filter(Boolean).map(encodeURIComponent).join('/');
const same = (a, b) => String(a ?? '').toLowerCase() === String(b ?? '').toLowerCase();

// An item as the app holds it: { drive, id, name, link, folder, kind, size, version, modified, by }.
const DETAILS = '$expand=listItem($expand=fields($select=_UIVersionString))';
const itemOf = it => ({
  drive: it.parentReference?.driveId ?? null, id: it.id, name: it.name, link: it.webUrl ?? null, folder: !!it.folder,
  kind: it.folder ? 'folder' : kindOf(it.name), size: it.size ?? null, version: it.listItem?.fields?._UIVersionString ?? null,
  modified: it.lastModifiedDateTime ?? null, by: it.lastModifiedBy?.user?.displayName ?? null,
});

// The library or folder the settings name, as a folder item.
let lib = null;
function library() {
  return lib ??= (async () => {
    const p = parse(settings().library);
    if (!p.host || !p.library) throw new SharePointError('No library is set.', 0);
    const site = await graph(`/sites/${p.host}${p.site ? `:${p.site}` : ''}`);
    const drives = await all(`/sites/${site.id}/drives?$select=id,name,webUrl`);
    const d = drives.find(x => same(x.name, p.library) || same(decode(new URL(x.webUrl).pathname).split('/').pop(), p.library));
    if (!d) throw new SharePointError(`There’s no library called ${p.library} there.`, 404);
    return itemOf(await graph(`/drives/${d.id}/root${p.folder ? `:/${encodePath(p.folder)}` : ''}`));
  })().catch(e => { lib = null; throw e; });
}
// A folder's contents, folders first: the library's, or a folder's from an earlier browse.
async function browse(folder) {
  const f = folder ?? await library();
  return (await all(`/drives/${f.drive}/items/${f.id}/children?${DETAILS}&$top=200`)).map(itemOf)
    .sort((a, b) => b.folder - a.folder || a.name.localeCompare(b.name));
}
// The library's files and folders whose names or contents match, as SharePoint's own search finds them.
async function search(query) {
  const f = await library(), q = encodeURIComponent(String(query).replace(/'/g, "''"));
  return (await all(`/drives/${f.drive}/root/search(q='${q}')?${DETAILS}`)).map(itemOf);
}
// An item's details: from a link of any kind SharePoint gives out, or an item { drive, id }.
function item(ref) {
  if (typeof ref !== 'string') return graph(`/drives/${ref.drive}/items/${ref.id}?${DETAILS}`).then(itemOf);
  const share = `u!${btoa(String.fromCharCode(...new TextEncoder().encode(ref))).replace(/=+$/, '').replace(/\//g, '_').replace(/\+/g, '-')}`;
  return graph(`/shares/${share}/driveItem?${DETAILS}`).then(itemOf);
}

// Microsoft's File Picker (v8), hosted by the tenant, in a window of its own, opened at the library: the
// documents picked, as items, or none if it's closed. Called on a click, since it opens a window.
function pick({ multiple = false } = {}) {
  const win = window.open('', 'dendra-picker', 'width=1080,height=680');
  if (!win) return Promise.reject(new SharePointError('The browser blocked the picker’s window.', 0));
  const p = parse(settings().library), base = `https://${p.host}`, channelId = crypto.randomUUID();
  const options = {
    sdk: '8.0', authentication: {}, messaging: { origin: location.origin, channelId },
    entry: { sharePoint: { byPath: { web: base + (p.site ?? ''), list: p.library, ...(p.folder && { folder: p.folder }) } } },
    selection: { mode: multiple ? 'multiple' : 'single' }, typesAndSources: { mode: 'files' },
  };
  return new Promise((resolve, reject) => {
    let port = null;
    const done = (items, error) => {
      removeEventListener('message', hello);
      clearInterval(watch);
      port?.close();
      win.close();
      error ? reject(error) : resolve(items);
    };
    const watch = setInterval(() => win.closed && done([]), 500);
    // The picker introduces itself on the window, then speaks over a port of its own.
    function hello(e) {
      if (e.source !== win || e.data?.type !== 'initialize' || e.data.channelId !== channelId) return;
      port = e.ports[0];
      port.onmessage = async ({ data: m }) => {
        if (m.type !== 'command') return;
        port.postMessage({ type: 'acknowledge', id: m.id });
        const c = m.data, reply = data => port.postMessage({ type: 'result', id: m.id, data });
        try {
          if (c.command === 'authenticate') reply({ result: 'token', token: await token([`${c.resource}/.default`]) });
          else if (c.command === 'pick') {
            reply({ result: 'success' });
            done(await Promise.all(c.items.map(i => item({ drive: i.parentReference.driveId, id: i.id }))));
          } else if (c.command === 'close') done([]);
          else reply({ result: 'error', error: { code: 'unsupportedCommand', message: c.command }, isExpected: true });
        } catch (error) { done(null, error); }
      };
      port.postMessage({ type: 'activate' });
    }
    addEventListener('message', hello);
    // The picker's page is opened by a form posting it a token for SharePoint.
    token([`${base}/.default`]).then(t => {
      const d = win.document, form = Object.assign(d.createElement('form'),
        { method: 'POST', action: `${base}/_layouts/15/FilePicker.aspx?${new URLSearchParams({ filePicker: JSON.stringify(options) })}` });
      form.append(Object.assign(d.createElement('input'), { type: 'hidden', name: 'access_token', value: t }));
      d.body.append(form);
      form.submit();
    }).catch(e => done(null, e));
  });
}

// ---- A workbook in the library, for the store ----
// A file is { drive, id } once it's there, or { drive, parent, name } before: a folder and a name.

// The file as it is now: { id, version, modified }, with its `text` unless its version is `known`; or
// null if there's no such file yet.
async function read(file, known) {
  let it;
  try { it = await graph(file.id ? `/drives/${file.drive}/items/${file.id}` : `/drives/${file.drive}/items/${file.parent}:/${encodeURIComponent(file.name)}`); }
  catch (e) { if (e.status === 404 && !file.id) return null; throw e; }
  const got = { id: it.id, version: it.eTag, modified: it.lastModifiedDateTime };
  if (it.eTag === known) return got;
  // The download address is signed for a short while, and takes no token.
  const res = await fetch(it['@microsoft.graph.downloadUrl']);
  if (!res.ok) throw new SharePointError(`SharePoint answered ${res.status}.`, res.status);
  return { ...got, text: await res.text() };
}
// Writes the file if it's still the version read (or, with none, if there's still no file there), and
// says what it is now. Otherwise it's refused, as `stale`: read it again.
async function write(file, text, version) {
  try {
    const it = await graph(version ? `/drives/${file.drive}/items/${file.id}/content`
      : `/drives/${file.drive}/items/${file.parent}:/${encodeURIComponent(file.name)}:/content?@microsoft.graph.conflictBehavior=fail`,
    { method: 'PUT', body: text, headers: { 'Content-Type': 'application/json', ...(version && { 'If-Match': version }) } });
    return { id: it.id, version: it.eTag, modified: it.lastModifiedDateTime };
  } catch (e) {
    if (e.status === 412 || e.status === 409) e.stale = true;
    throw e;
  }
}

return {
  parse, href, open,
  settings, configure, configured,
  ready, account, signIn, signOut,
  library, browse, search, item, pick, read, write,
  SharePointError,
};
})();
