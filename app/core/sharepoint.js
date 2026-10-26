// SharePoint: the library a team keeps its documents and workbooks in. What a link points at is Tree.linkOf's.
//
// One global, `SharePoint`, with nothing on the page:
// - href(link): an address a browser can follow;
// - settings: the tenant, the app's client id and the library's address, kept in this browser;
// - signing in through MSAL (vendor/msal), and Microsoft Graph as the person signed in: Microsoft's File
//   Picker for linking a document, and read and write for the store.
//
// Signing in and the picker need the page served over https (or from localhost): Entra ID sends a sign-in
// back only to an address registered for it, and a file has none. See docs/sharepoint-setup.md.
const SharePoint = (() => {

// An address a browser can follow: a file share's path as a file: URL, and anything else as it is.
const href = link => /^\\\\/.test(link)
  ? `file:${link.replace(/\\/g, '/').split('/').map((s, i) => i < 3 ? s : encodeURIComponent(s)).join('/')}` : link;

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
    if (!s.tenant || !s.client || typeof msal === 'undefined') return Promise.reject(new SharePointError('SharePoint isn’t set up.', 0));
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
const decode = s => { try { return decodeURIComponent(s); } catch { return s; } };

// An item as the app holds it: { drive, id, name, link }.
const itemOf = it => ({ drive: it.parentReference?.driveId ?? null, id: it.id, name: it.name, link: it.webUrl ?? null });

// The library or folder the settings name, as a folder item.
let lib = null;
function library() {
  return lib ??= (async () => {
    const p = Tree.linkOf(settings().library);
    if (!p.host || !p.library) throw new SharePointError('No library is set.', 0);
    const site = await graph(`/sites/${p.host}${p.site ? `:${p.site}` : ''}`);
    const drives = await all(`/sites/${site.id}/drives?$select=id,name,webUrl`);
    const d = drives.find(x => Tree.same(x.name, p.library) || Tree.same(decode(new URL(x.webUrl).pathname).split('/').pop(), p.library));
    if (!d) throw new SharePointError(`No library called ${p.library}`, 404);
    return itemOf(await graph(`/drives/${d.id}/root${p.folder ? `:/${encodePath(p.folder)}` : ''}`));
  })().catch(e => { lib = null; throw e; });
}
const item = ref => graph(`/drives/${ref.drive}/items/${ref.id}`).then(itemOf);

// Microsoft's File Picker (v8), hosted by the tenant, in a window of its own, opened at the library: the
// documents picked, as items, or none if it's closed. Called on a click, since it opens a window.
function pick({ multiple = false } = {}) {
  const win = window.open('', 'dendra-picker', 'width=1080,height=680');
  if (!win) return Promise.reject(new SharePointError('The browser blocked the picker’s window.', 0));
  const p = Tree.linkOf(settings().library), base = `https://${p.host}`, channelId = crypto.randomUUID();
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
  href,
  settings, configure, configured,
  ready, account, signIn, signOut,
  library, pick, read, write,
  SharePointError,
};
})();
