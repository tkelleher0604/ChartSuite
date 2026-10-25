// SharePoint: documents as the chart links to them, and the workbook kept in a SharePoint library, so a
// team shares one system of record under SharePoint's own permissions and version history.
//
// One global, `SharePoint`, with nothing on the page:
// - parseDocUrl(url): what a link points at (SharePoint, OneDrive, another DMS, the web), read from the
//   URL alone, with no network;
// - docIcon(kind): a small file-type glyph;
// - connector: the Microsoft Graph client. It runs live, with tokens from MSAL (vendor/msal), once a
//   tenant and an app registration are configured (docs/sharepoint-setup.md); until then, or whenever
//   demo mode is chosen, it runs against a mocked tenant with the same API, so the app works offline.
// - createGraphClient and createMsalAuth: the live client's two halves, which take their fetch and MSAL as
//   arguments, so they can be tested without a tenant.
//
// Items, live or demo, come back in one shape:
//   { id, driveId, name, webUrl, isFolder, size, lastModified, lastModifiedBy, createdBy, version, eTag,
//     path, kind, extension, fields }
// where `path` is the folder path within the library and `fields` the library's own columns.

const SharePoint = (() => {

// ---- Reading links ----

const KIND_BY_EXTENSION = {
  doc: 'word', docx: 'word', docm: 'word', dot: 'word', dotx: 'word', rtf: 'word',
  pdf: 'pdf',
  xls: 'excel', xlsx: 'excel', xlsm: 'excel', xlsb: 'excel', csv: 'excel',
  ppt: 'powerpoint', pptx: 'powerpoint', pptm: 'powerpoint',
  msg: 'email', eml: 'email',
};
// The letter a modern SharePoint link carries after its first colon: /:w:/ for Word, and so on. A link
// made by "Copy link" names no file, so the letter is all there is to go on; :b: is used for PDFs and
// other files alike, and most often for PDFs.
const KIND_BY_LETTER = { w: 'word', x: 'excel', p: 'powerpoint', b: 'pdf', f: 'folder', o: 'other', v: 'other', i: 'other', t: 'other', u: 'other' };

const kindOfName = name => {
  const ext = extensionOf(name);
  return ext ? KIND_BY_EXTENSION[ext] ?? 'other' : 'other';
};
const extensionOf = name => {
  const m = /\.([A-Za-z0-9]{1,5})$/.exec(name ?? '');
  return m ? m[1].toLowerCase() : null;
};
// A web page's address ends like a file's but names no document.
const PAGE_EXTENSIONS = new Set(['aspx', 'asp', 'html', 'htm', 'php', 'jsp', 'cgi']);
const fileNameOf = segment => extensionOf(segment) && !PAGE_EXTENSIONS.has(extensionOf(segment)) ? segment : null;
const decode = s => { try { return decodeURIComponent(s); } catch { return s; } };

const isSharePointHost = host => /\.sharepoint(-df)?\.(com|us|de|cn)$/i.test(host);
const isOneDriveHost = host => /-my\.sharepoint(-df)?\.(com|us|de|cn)$/i.test(host) || /(^|\.)onedrive\.live\.com$|(^|\.)1drv\.ms$/i.test(host);

// What a link points at, from the URL alone:
//   { url, valid, system, isSharePoint, host, site, library, folderPath, fileName, extension, kind, isSharingLink }
// `system` is 'sharepoint', 'onedrive', 'netdocuments', 'imanage', 'file' or 'web'. `site` is the site's
// path name (FundLegal for /sites/FundLegal); `library` the library's segment as written in the URL,
// decoded ("Shared Documents"); `folderPath` the folders below it, joined with "/". A link that names no
// file (a folder, or a sharing link) has no fileName.
function parseDocUrl(url) {
  const text = String(url ?? '').trim();
  const out = { url: text, valid: false, system: 'web', isSharePoint: false, host: null, site: null, library: null,
    folderPath: '', fileName: null, extension: null, kind: 'other', isSharingLink: false };
  if (!text) return out;
  // In-house document management systems that aren't on the web: iManage's iwl: links, UNC paths.
  if (/^iwl:/i.test(text)) return { ...out, valid: true, system: 'imanage' };
  if (/^\\\\/.test(text) || /^file:/i.test(text)) {
    const parts = text.replace(/^file:\/*/i, '').split(/[\\/]+/).filter(Boolean).map(decode);
    const last = parts.at(-1) ?? null;
    const named = extensionOf(last) ? last : null;
    return { ...out, valid: true, system: 'file', host: parts[0] ?? null, folderPath: parts.slice(1, named ? -1 : undefined).join('/'),
      fileName: named, extension: extensionOf(named), kind: named ? kindOfName(named) : 'folder' };
  }
  let u;
  try { u = new URL(text); } catch { return out; }
  out.valid = true;
  out.host = u.hostname.toLowerCase();
  if (/(^|\.)netvoyage\.com$|(^|\.)netdocuments\.com$/i.test(out.host)) out.system = 'netdocuments';
  const sp = isSharePointHost(out.host) || /\/_layouts\/15\//i.test(u.pathname);
  if (!sp) {
    if (isOneDriveHost(out.host)) { out.system = 'onedrive'; return out; }
    const last = fileNameOf(decode(u.pathname.split('/').filter(Boolean).at(-1) ?? ''));
    if (last) Object.assign(out, { fileName: last, extension: extensionOf(last), kind: kindOfName(last) });
    return out;
  }
  out.isSharePoint = true;
  out.system = isOneDriveHost(out.host) ? 'onedrive' : 'sharepoint';
  let segs = u.pathname.split('/').filter(Boolean);

  // A modern link: /:w:/r/sites/X/Library/… (r: a redirect that spells out the path), or /:b:/s/X/token
  // (a sharing link, which names no file), or /:w:/g/personal/user/token on OneDrive.
  const modern = /^:([a-z]):$/i.exec(segs[0] ?? '');
  let letterKind = null;
  if (modern) {
    letterKind = KIND_BY_LETTER[modern[1].toLowerCase()] ?? 'other';
    const how = (segs[1] ?? '').toLowerCase();
    segs = segs.slice(2);
    if (how !== 'r') {
      out.isSharingLink = true;
      if (/^(sites|teams|personal)$/i.test(segs[0] ?? '')) out.site = decode(segs[1] ?? '') || null;
      else if (how === 's' || how === 'g') out.site = decode(segs[0] ?? '') || null;
      out.kind = letterKind;
      return out;
    }
  }

  // Layout pages carry the file in a query parameter: Doc.aspx?…&file=Name.docx, or a library view's
  // AllItems.aspx?id=/sites/X/Library/Folder/File.pdf.
  const idParam = u.searchParams.get('id');
  const fileParam = u.searchParams.get('file');
  const isLayout = segs.some(s => /^_layouts$/i.test(s)) || /\.aspx$/i.test(segs.at(-1) ?? '');
  if (isLayout && idParam) segs = idParam.split('/').filter(Boolean);
  else if (isLayout) {
    const at = segs.findIndex(s => /^_layouts$/i.test(s));
    segs = at > 0 ? segs.slice(0, at) : segs.slice(0, -1);
    if (/^Forms$/i.test(segs.at(-1) ?? '')) segs = segs.slice(0, -1);
  }

  // /sites/X or /teams/X or /personal/user, then the library, then folders and the file.
  if (/^(sites|teams|personal)$/i.test(segs[0] ?? '')) { out.site = decode(segs[1] ?? '') || null; segs = segs.slice(2); }
  out.library = segs.length ? decode(segs[0]) : null;
  const rest = segs.slice(1).map(decode);
  // The file is the last segment if it names one, or else what a layout page's file parameter names.
  const fromPath = fileNameOf(rest.at(-1));
  const named = fromPath ?? (isLayout && fileParam ? decode(fileParam) : null);
  out.fileName = named;
  out.folderPath = (fromPath ? rest.slice(0, -1) : rest).join('/');
  out.extension = extensionOf(named);
  out.kind = named ? kindOfName(named) : 'folder';
  return out;
}

// ---- File-type glyphs ----
// One plain document outline with a short type label, or a folder; no product logos. Drawn in
// currentColor, so the page tints them.

const KIND_LABELS = {
  word: ['DOC', 'Word document'], pdf: ['PDF', 'PDF'], excel: ['XLS', 'Spreadsheet'], powerpoint: ['PPT', 'Presentation'],
  email: ['MSG', 'Email'], folder: ['', 'Folder'], other: ['', 'File'],
};
function docIcon(kind) {
  const [label, title] = KIND_LABELS[kind] ?? KIND_LABELS.other;
  const svg = kind === 'folder'
    ? '<svg class="doc-icon" viewBox="0 0 20 20" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"><path d="M2.5 5.5v10h15v-8h-7.5l-2-2h-5.5z"/></svg>'
    : `<svg class="doc-icon" viewBox="0 0 20 20" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"><path d="M5 2.5h7l3.5 3.5v11.5h-10.5z"/><path d="M12 2.5v3.5h3.5"/>${label
      ? `<text x="10.2" y="14.6" text-anchor="middle" font-size="${label.length > 2 ? 4.6 : 5.4}" font-family="Inter, system-ui, sans-serif" font-weight="700" fill="currentColor" stroke="none">${label}</text>` : ''}</svg>`;
  return { kind: KIND_LABELS[kind] ? kind : 'other', label, title, svg };
}

// ---- Errors the app can tell apart ----

class SharePointError extends Error {
  constructor(message, extra = {}) { super(message); this.name = this.constructor.name; Object.assign(this, extra); }
}
// Someone saved the workbook since it was loaded: `current` is the item as it is now, with who saved it.
class ConflictError extends SharePointError {}
// Not signed in, or consent missing; `interactive` says whether signing in again can fix it.
class AuthError extends SharePointError {}
class NotConfiguredError extends SharePointError {}
class NotFoundError extends SharePointError {}
// Anything else Graph refused: `status`, and Graph's own `code`.
class GraphError extends SharePointError {}

// ---- Configuration ----

const CONFIG_KEY = 'rboreal.sharepoint.config';
const DEFAULT_CONFIG = { mode: 'demo', tenantId: '', clientId: '', redirectUri: '', siteUrl: '', library: 'Documents', workbookFolder: 'Rboreal' };

function loadConfig() {
  try { return { ...DEFAULT_CONFIG, ...JSON.parse(localStorage.getItem(CONFIG_KEY)) }; } catch { return { ...DEFAULT_CONFIG }; }
}
function storeConfig(c) {
  try { localStorage.setItem(CONFIG_KEY, JSON.stringify(c)); } catch {}
}

// ---- Graph, live ----

const GRAPH = 'https://graph.microsoft.com/v1.0';
const READ_SCOPES = ['Files.Read.All', 'Sites.Read.All', 'User.Read'];
const WRITE_SCOPES = ['Files.ReadWrite.All', 'Sites.Read.All', 'User.Read'];
const SIMPLE_UPLOAD_LIMIT = 4 * 1024 * 1024;

// A share token for /shares/{token}: "u!" and the URL in unpadded base64url.
function shareToken(url) {
  const b64 = btoa(unescape(encodeURIComponent(url)));
  return `u!${b64.replace(/=+$/, '').replace(/\//g, '_').replace(/\+/g, '-')}`;
}
// A path within a library, each segment encoded, for /root:/{path}.
const encodePath = path => String(path).split('/').filter(Boolean).map(encodeURIComponent).join('/');

// A driveItem as the app holds it.
function fromGraphItem(it, driveId) {
  const name = it.name ?? '';
  const parent = it.parentReference?.path ?? '';
  const path = decode(parent.replace(/^\/drives\/[^/]+\/root:?\/?/, '').replace(/^\/drive\/root:?\/?/, ''));
  const isFolder = !!it.folder;
  return {
    id: it.id, driveId: it.parentReference?.driveId ?? driveId ?? null, name, webUrl: it.webUrl ?? null, isFolder,
    size: it.size ?? null, lastModified: it.lastModifiedDateTime ?? null, lastModifiedBy: it.lastModifiedBy?.user?.displayName ?? null,
    createdBy: it.createdBy?.user?.displayName ?? null, version: it.listItem?.fields?._UIVersionString ?? null,
    eTag: it.eTag ?? null, path, kind: isFolder ? 'folder' : kindOfName(name), extension: isFolder ? null : extensionOf(name),
    fields: it.listItem?.fields ? stripSystemFields(it.listItem.fields) : {},
    downloadUrl: it['@microsoft.graph.downloadUrl'] ?? null,
  };
}
// A library's own columns, without SharePoint's housekeeping ones.
const stripSystemFields = f => Object.fromEntries(Object.entries(f).filter(([k]) => !/^(_|@|odata|ContentType|FileLeafRef|LinkFilename|Edit|ItemChildCount|FolderChildCount|AppAuthor|AppEditor|ComplianceAsset|DocIcon|FileSizeDisplay|id$|Created|Modified|Author|Editor)/.test(k)));

// The live client. `fetchImpl` and `getToken(scopes, { interactive })` can be supplied, which is how the
// test page checks the requests it makes without a tenant.
function createGraphClient({ fetchImpl = (...a) => fetch(...a), getToken, config }) {
  const siteCache = new Map(), driveCache = new Map();

  async function call(path, { method = 'GET', headers = {}, body, scopes = READ_SCOPES, raw = false, absolute = false } = {}) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const token = await getToken(scopes, { interactive: attempt > 0 });
      const res = await fetchImpl(absolute ? path : `${GRAPH}${path}`, { method, headers: { Authorization: `Bearer ${token}`, ...headers }, body });
      if (res.status === 401 && attempt === 0) continue;
      if (res.status === 429 || res.status === 503) {
        const wait = Math.min(Number(res.headers?.get?.('Retry-After') ?? 1), 10);
        await new Promise(r => setTimeout(r, wait * 1000));
        continue;
      }
      if (res.ok) return raw ? res : res.status === 204 ? null : res.json();
      let detail = {};
      try { detail = (await res.json()).error ?? {}; } catch {}
      if (res.status === 401 || res.status === 403) throw new AuthError(detail.message ?? 'SharePoint refused access.', { status: res.status, code: detail.code, interactive: res.status === 401 });
      if (res.status === 404) throw new NotFoundError(detail.message ?? 'Not found in SharePoint.', { status: 404, code: detail.code });
      if (res.status === 412) throw new ConflictError('Someone else saved it since it was opened.', { status: 412, code: detail.code });
      throw new GraphError(detail.message ?? `SharePoint answered ${res.status}.`, { status: res.status, code: detail.code });
    }
    throw new GraphError('SharePoint kept asking to wait. Try again shortly.', { status: 429 });
  }

  // Every page of a collection, following @odata.nextLink, up to 50 pages, so a server that keeps paging can't hang us.
  async function all(path, opts) {
    const out = [];
    let page = await call(path, opts);
    for (let n = 0; page; n++) {
      out.push(...(page.value ?? []));
      if (!page['@odata.nextLink'] || n > 50) break;
      page = await call(page['@odata.nextLink'], { ...opts, absolute: true });
    }
    return out;
  }

  // The site a URL like https://contoso.sharepoint.com/sites/FundLegal names, by Graph's id for it.
  async function siteId(siteUrl = config().siteUrl) {
    if (!siteUrl) throw new NotConfiguredError('No SharePoint site is configured.');
    if (!siteCache.has(siteUrl)) {
      const u = new URL(siteUrl);
      const rel = u.pathname.replace(/\/+$/, '');
      siteCache.set(siteUrl, (await call(rel ? `/sites/${u.hostname}:${rel}` : `/sites/${u.hostname}`)).id);
    }
    return siteCache.get(siteUrl);
  }
  // The configured library's drive, matched by its name or its URL's last segment ("Shared Documents").
  async function libraryDrive() {
    const { siteUrl, library } = config();
    const key = `${siteUrl}|${library}`;
    if (!driveCache.has(key)) {
      const drives = await listDrives(siteUrl);
      const want = (library || 'Documents').toLowerCase();
      const d = drives.find(x => x.name.toLowerCase() === want || decode(x.webUrl ?? '').toLowerCase().endsWith(`/${want}`)) ?? drives[0];
      if (!d) throw new NotFoundError(`No library called ${library} on ${siteUrl}.`);
      driveCache.set(key, d.id);
    }
    return driveCache.get(key);
  }

  const EXPAND = '$expand=listItem($expand=fields)';

  async function whoAmI() {
    const me = await call('/me?$select=displayName,mail,userPrincipalName');
    return { name: me.displayName, email: me.mail ?? me.userPrincipalName };
  }
  async function listDrives(siteUrl) {
    const drives = await all(`/sites/${await siteId(siteUrl)}/drives?$select=id,name,webUrl,driveType`);
    return drives.map(d => ({ id: d.id, name: d.name, webUrl: d.webUrl, driveType: d.driveType }));
  }
  async function listChildren(driveId, itemId) {
    const d = driveId ?? await libraryDrive();
    const items = await all(`/drives/${d}/items/${itemId ?? 'root'}/children?${EXPAND}&$top=200`);
    return items.map(it => fromGraphItem(it, d));
  }
  // Search the configured library (or the drive given) for names and content, as SharePoint's own search
  // box does. Graph wants single quotes in the query doubled.
  async function search(query, { driveId } = {}) {
    const d = driveId ?? await libraryDrive();
    const q = String(query ?? '').replace(/'/g, "''");
    const items = await all(`/drives/${d}/root/search(q='${encodeURIComponent(q)}')?${EXPAND}&$top=50`);
    return items.map(it => fromGraphItem(it, d));
  }
  async function getItem(ref) {
    if (typeof ref === 'string') return resolveShareUrl(ref);
    const { driveId, itemId } = ref ?? {};
    return fromGraphItem(await call(`/drives/${driveId}/items/${itemId}?${EXPAND}`), driveId);
  }
  // Any link SharePoint can resolve, a sharing link or a plain file URL, to the item it points at.
  async function resolveShareUrl(url) {
    return fromGraphItem(await call(`/shares/${shareToken(url)}/driveItem?${EXPAND}`));
  }
  async function listVersions(driveId, itemId) {
    const versions = await all(`/drives/${driveId}/items/${itemId}/versions`);
    return versions.map(v => ({ id: v.id, lastModified: v.lastModifiedDateTime, lastModifiedBy: v.lastModifiedBy?.user?.displayName ?? null, size: v.size ?? null }));
  }

  // The workbook as a JSON file in the library: its text, and its eTag for saving it back.
  async function loadWorkbook(path) {
    const d = await libraryDrive();
    const meta = await call(`/drives/${d}/root:/${encodePath(path)}?${EXPAND}`);
    const url = meta['@microsoft.graph.downloadUrl'];
    // The download URL is pre-authenticated and short-lived; it takes no token.
    const res = url ? await fetchImpl(url) : await call(`/drives/${d}/items/${meta.id}/content`, { raw: true });
    if (!res.ok) throw new GraphError(`SharePoint answered ${res.status} for the workbook's content.`, { status: res.status });
    return { json: await res.text(), eTag: meta.eTag, item: fromGraphItem(meta, d) };
  }
  // Saves the workbook. With the eTag it was loaded with, the save is refused if anyone has saved since
  // (a ConflictError with the item as it is now); with none, it's refused if the file already exists.
  async function saveWorkbook(path, json, eTag) {
    const d = await libraryDrive();
    const body = typeof json === 'string' ? json : JSON.stringify(json);
    if (new Blob([body]).size > SIMPLE_UPLOAD_LIMIT) throw new GraphError('The workbook is over 4 MB, more than a simple save to SharePoint takes.', { status: 413 });
    try {
      const it = await call(`/drives/${d}/root:/${encodePath(path)}:/content`, {
        method: 'PUT', scopes: WRITE_SCOPES, body,
        headers: { 'Content-Type': 'application/json', ...(eTag ? { 'If-Match': eTag } : { 'If-None-Match': '*' }) },
      });
      return { eTag: it.eTag, item: fromGraphItem(it, d) };
    } catch (e) {
      if (!(e instanceof ConflictError)) throw e;
      let current = null;
      try { current = fromGraphItem(await call(`/drives/${d}/root:/${encodePath(path)}?${EXPAND}`), d); } catch {}
      throw new ConflictError(current?.lastModifiedBy ? `${current.lastModifiedBy} saved it since it was opened.` : e.message, { status: 412, current });
    }
  }

  return { whoAmI, listDrives, listChildren, search, getItem, resolveShareUrl, listVersions, loadWorkbook, saveWorkbook, shareToken };
}

// Tokens from MSAL: silently where it can, by a popup where it must, and by a redirect where the browser
// blocks popups. A redirect leaves the page; MSAL finishes it when the page loads again. The account signed
// in is the one MSAL remembers in session storage; this page never sees a password.
const POPUP_BLOCKED = new Set(['popup_window_error', 'empty_window_error', 'block_nested_popups']);

function createMsalAuth(config, msalImpl) {
  let pca = null, ready = null;
  const msalLib = () => {
    const lib = msalImpl ?? globalThis.msal;
    if (!lib) throw new NotConfiguredError('MSAL isn’t loaded: add vendor/msal/msal-browser.min.js to the page.');
    return lib;
  };
  function app() {
    if (!pca) {
      const c = config();
      if (!c.tenantId || !c.clientId) throw new NotConfiguredError('Enter the tenant ID and client ID in Settings › SharePoint first.');
      pca = new (msalLib().PublicClientApplication)({
        auth: { clientId: c.clientId, authority: `https://login.microsoftonline.com/${c.tenantId}`, redirectUri: c.redirectUri || location.origin + location.pathname },
        cache: { cacheLocation: 'sessionStorage' },
      });
      ready = pca.initialize().then(() => pca.handleRedirectPromise()).then(r => { if (r?.account) pca.setActiveAccount(r.account); });
    }
    return ready.then(() => pca);
  }
  const account = p => p.getActiveAccount() ?? p.getAllAccounts()[0] ?? null;
  // A popup, or the redirect when the browser won't open one. The redirect's promise never settles: the page is leaving.
  async function interact(popup, redirect) {
    try { return await popup(); } catch (e) {
      if (!POPUP_BLOCKED.has(e.errorCode)) throw e;
      await redirect();
      return new Promise(() => {});
    }
  }
  return {
    reset() { pca = null; ready = null; },
    async signIn() {
      const p = await app();
      const request = { scopes: READ_SCOPES, prompt: 'select_account' };
      const r = await interact(() => p.loginPopup(request), () => p.loginRedirect(request));
      p.setActiveAccount(r.account);
      return r.account;
    },
    async signOut() {
      const p = await app();
      const a = account(p);
      if (a) await interact(() => p.logoutPopup({ account: a }), () => p.logoutRedirect({ account: a }));
    },
    async isSignedIn() { return !!account(await app()); },
    async getToken(scopes, { interactive = false } = {}) {
      const p = await app();
      const a = account(p);
      if (!a) throw new AuthError('Sign in to SharePoint first.', { interactive: true });
      const request = { scopes, account: a };
      if (!interactive) {
        try { return (await p.acquireTokenSilent(request)).accessToken; } catch (e) {
          if (!(e instanceof msalLib().InteractionRequiredAuthError)) throw new AuthError(e.message ?? 'Couldn’t get a SharePoint token.', { interactive: true });
        }
      }
      return (await interact(() => p.acquireTokenPopup(request), () => p.acquireTokenRedirect(request))).accessToken;
    },
  };
}

// ---- Demo: a mocked tenant ----
// Contoso's "Fund Legal" site and its Documents library, with plausible documents for the sample chart's
// funds. Same API as live, with the same item shape, so the app can be built, shown and tested offline.
// What's saved in demo mode is kept in the browser.

const DEMO_HOST = 'contoso.sharepoint.com';
const DEMO_SITE = `https://${DEMO_HOST}/sites/FundLegal`;
const DEMO_LIBRARY_URL = `${DEMO_SITE}/Shared%20Documents`;
const DEMO_DRIVE = 'b!demo-fundlegal-documents';
const DEMO_STORE_KEY = 'rboreal.sharepoint.demo';

// Each document: its folder path, name, size in KB, last modified, by whom, version, and the library's
// columns (Document Type, Entity, Effective Date).
const DEMO_DOCS = [
  ['Calder Ridge Fund III/Governing Documents', 'Certificate of Limited Partnership - Calder Ridge Capital Partners III, L.P.pdf', 182, '2023-02-14', 'Jordan Alvarez', '1.0', 'Certificate of Formation', 'Calder Ridge Capital Partners III, L.P.', '2023-02-14'],
  ['Calder Ridge Fund III/Governing Documents', 'Amended and Restated Limited Partnership Agreement - Calder Ridge Capital Partners III, L.P.pdf', 2140, '2023-06-30', 'Margaret A. Chen', '3.0', 'Limited Partnership Agreement', 'Calder Ridge Capital Partners III, L.P.', '2023-06-30'],
  ['Calder Ridge Fund III/Governing Documents', 'Exempted Limited Partnership Agreement - Calder Ridge Capital Partners III (Cayman), L.P.pdf', 1866, '2023-06-30', 'Margaret A. Chen', '2.0', 'Limited Partnership Agreement', 'Calder Ridge Capital Partners III (Cayman), L.P.', '2023-06-30'],
  ['Calder Ridge Fund III/Governing Documents', 'Limited Liability Company Agreement - Calder Ridge Capital GP III, LLC.docx', 96, '2023-02-10', 'Jordan Alvarez', '2.0', 'Operating Agreement', 'Calder Ridge Capital GP III, LLC', '2023-02-10'],
  ['Calder Ridge Fund III/Governing Documents', 'Certificate of Incorporation - Calder Ridge III Blocker, Inc.pdf', 154, '2023-05-22', 'Jordan Alvarez', '1.0', 'Certificate of Formation', 'Calder Ridge III Blocker, Inc.', '2023-05-22'],
  ['Calder Ridge Fund III/Side Letters', 'Side Letter - U.S. Investors Series A.pdf', 342, '2023-07-12', 'Priya N. Raman', '1.0', 'Side Letter', 'Calder Ridge Capital Partners III, L.P.', '2023-07-12'],
  ['Calder Ridge Fund III/Side Letters', 'Side Letter - Halcyon University Endowment.pdf', 288, '2023-09-01', 'Priya N. Raman', '2.0', 'Side Letter', 'Calder Ridge Capital Partners III, L.P.', '2023-09-01'],
  ['Calder Ridge Fund III/Side Letters', 'MFN Election Form - Fund III.docx', 64, '2024-01-19', 'Jordan Alvarez', '1.0', 'MFN Election', 'Calder Ridge Capital Partners III, L.P.', '2024-01-19'],
  ['Calder Ridge Fund III/Regulatory', 'Form D - Calder Ridge Capital Partners III, L.P.pdf', 118, '2023-07-05', 'Jordan Alvarez', '1.0', 'Regulatory Filing', 'Calder Ridge Capital Partners III, L.P.', '2023-07-05'],
  ['Calder Ridge Fund III/Regulatory', 'Form D Amendment 2024 - Calder Ridge Capital Partners III, L.P.pdf', 121, '2024-06-28', 'Jordan Alvarez', '1.0', 'Regulatory Filing', 'Calder Ridge Capital Partners III, L.P.', '2024-06-28'],
  ['Calder Ridge Fund III/Regulatory', 'CIMA Registration - Calder Ridge Capital Partners III (Cayman), L.P.pdf', 205, '2023-08-15', 'Priya N. Raman', '1.0', 'Regulatory Filing', 'Calder Ridge Capital Partners III (Cayman), L.P.', '2023-08-15'],
  ['Calder Ridge Fund III/Board Consents', 'GP Written Consent - Admission of Limited Partners (First Closing).pdf', 87, '2023-06-30', 'Margaret A. Chen', '1.0', 'Consent', 'Calder Ridge Capital GP III, LLC', '2023-06-30'],
  ['Calder Ridge Fund III/Board Consents', 'Blocker Board Resolutions - Halvard Acquisition.docx', 58, '2024-03-11', 'David R. Okafor', '2.0', 'Resolution', 'Calder Ridge III Blocker, Inc.', '2024-03-11'],
  ['Calder Ridge Fund III/Board Consents', 'GP Written Consent - Northpine Investment.pdf', 74, '2023-11-02', 'Margaret A. Chen', '1.0', 'Consent', 'Calder Ridge Capital GP III, LLC', '2023-11-02'],
  ['Calder Ridge Fund III/Tax', 'IRS EIN Confirmation (CP 575) - Calder Ridge Capital Partners III, L.P.pdf', 46, '2023-02-21', 'Jordan Alvarez', '1.0', 'Tax Document', 'Calder Ridge Capital Partners III, L.P.', '2023-02-21'],
  ['Calder Ridge Fund III/Tax', 'Delaware Franchise Tax Report 2025 - Calder Ridge III Blocker, Inc.pdf', 66, '2025-02-26', 'Jordan Alvarez', '1.0', 'Tax Document', 'Calder Ridge III Blocker, Inc.', '2025-02-26'],
  ['Calder Ridge Fund III/Tax', 'Entity Classification Election (Form 8832) - Northpine Software, LLC.pdf', 39, '2023-12-04', 'Priya N. Raman', '1.0', 'Tax Document', 'Northpine Software, LLC', '2023-12-04'],
  ['Calder Ridge Fund III/Tax', 'Form W-9 - Calder Ridge Capital Partners III, L.P.pdf', 31, '2024-01-08', 'Jordan Alvarez', '1.0', 'Tax Document', 'Calder Ridge Capital Partners III, L.P.', '2024-01-08'],
  ['Calder Ridge Capital BDC/Governing Documents', 'Articles of Incorporation - Calder Ridge Capital BDC, Inc.pdf', 233, '2021-09-08', 'Margaret A. Chen', '1.0', 'Certificate of Formation', 'Calder Ridge Capital BDC, Inc.', '2021-09-08'],
  ['Calder Ridge Capital BDC/Governing Documents', 'Investment Advisory Agreement - Calder Ridge Capital BDC, Inc.docx', 148, '2022-01-31', 'Margaret A. Chen', '4.0', 'Advisory Agreement', 'Calder Ridge Capital BDC, Inc.', '2022-01-31'],
  ['Calder Ridge Capital BDC/Regulatory', 'Form N-54A - Election to Be Regulated as a BDC.pdf', 52, '2021-10-15', 'Jordan Alvarez', '1.0', 'Regulatory Filing', 'Calder Ridge Capital BDC, Inc.', '2021-10-15'],
  ['Calder Ridge Capital BDC/Regulatory', 'Co-Investment Exemptive Order - Calder Ridge Capital.pdf', 410, '2022-06-24', 'Priya N. Raman', '1.0', 'Exemptive Relief', 'Calder Ridge Capital BDC, Inc.', '2022-06-24'],
  ['Calder Ridge Capital BDC/Regulatory', 'Close and Remote Affiliate Analysis - Q3 2026.xlsx', 77, '2026-10-02', 'Priya N. Raman', '6.0', 'Compliance Analysis', 'Calder Ridge Capital BDC, Inc.', '2026-09-30'],
  ['Calder Ridge Capital BDC/Board Consents', 'Board Minutes - Q3 2026 Regular Meeting.docx', 112, '2026-09-18', 'David R. Okafor', '2.0', 'Minutes', 'Calder Ridge Capital BDC, Inc.', '2026-09-17'],
  ['Calder Ridge Capital Management/Compliance', 'Form ADV Part 2A - Calder Ridge Capital Management, LLC.pdf', 640, '2026-03-28', 'Priya N. Raman', '5.0', 'Regulatory Filing', 'Calder Ridge Capital Management, LLC', '2026-03-28'],
  ['Calder Ridge Capital Management/Compliance', 'Code of Ethics - Calder Ridge Capital Management, LLC.pdf', 188, '2025-12-15', 'Priya N. Raman', '3.0', 'Policy', 'Calder Ridge Capital Management, LLC', '2025-12-15'],
  ['Calder Ridge Capital Management/Compliance', 'Officer Appointment Email - D. Okafor.msg', 22, '2024-04-02', 'Margaret A. Chen', '1.0', 'Correspondence', 'Calder Ridge Capital Management, LLC', '2024-04-02'],
  ['Calder Ridge Capital Management/Compliance', 'Investor Presentation - Fund III Annual Meeting 2026.pptx', 5120, '2026-05-06', 'David R. Okafor', '2.0', 'Presentation', 'Calder Ridge Capital Management, LLC', '2026-05-06'],
];

// A short stable id from a path, so links built from the demo stay good from one session to the next.
function hashId(s) {
  let h = 2166136261;
  for (const c of s) h = Math.imul(h ^ c.codePointAt(0), 16777619) >>> 0;
  return h.toString(36).toUpperCase().padStart(7, '0');
}
const urlPath = path => path.split('/').map(encodeURIComponent).join('/');
const SHARE_LETTER = { word: 'w', excel: 'x', powerpoint: 'p', pdf: 'b', email: 'u', other: 'u', folder: 'f' };

function buildDemoTree() {
  const items = new Map();
  const add = (path, name, isFolder, extra = {}) => {
    const full = path ? `${path}/${name}` : name;
    const id = `D${hashId(full)}`;
    if (items.has(id)) return items.get(id);
    const it = {
      id, driveId: DEMO_DRIVE, name, webUrl: `${DEMO_LIBRARY_URL}/${urlPath(full)}`, isFolder, size: isFolder ? null : 0,
      lastModified: '2023-02-10T15:00:00Z', lastModifiedBy: 'Jordan Alvarez', createdBy: 'Jordan Alvarez', version: isFolder ? null : '1.0',
      eTag: `"{${id}},1"`, path: path ?? '', kind: isFolder ? 'folder' : kindOfName(name), extension: isFolder ? null : extensionOf(name), fields: {},
      shareUrl: `https://${DEMO_HOST}/:${SHARE_LETTER[isFolder ? 'folder' : kindOfName(name)]}:/s/FundLegal/E${id.slice(1)}${hashId(name).slice(0, 4)}`, ...extra,
    };
    items.set(id, it);
    return it;
  };
  const ensureFolder = path => {
    const parts = path.split('/').filter(Boolean);
    parts.forEach((p, i) => add(parts.slice(0, i).join('/'), p, true));
  };
  for (const [folder, name, kb, modified, by, version, type, entity, effective] of DEMO_DOCS) {
    ensureFolder(folder);
    add(folder, name, false, {
      size: kb * 1024, lastModified: `${modified}T16:30:00Z`, lastModifiedBy: by, createdBy: by, version,
      eTag: `"{${'D' + hashId(`${folder}/${name}`)}},${Math.round(Number(version))}"`,
      fields: { DocumentType: type, Entity: entity, EffectiveDate: effective },
    });
  }
  ensureFolder('Rboreal');
  return items;
}

function createDemoClient() {
  const items = buildDemoTree();
  // Workbooks saved in demo mode: path → { json, eTag, n, lastModified, lastModifiedBy, versions }.
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(DEMO_STORE_KEY)) ?? {}; } catch {}
  const persist = () => { try { localStorage.setItem(DEMO_STORE_KEY, JSON.stringify(saved)); } catch {} };
  let user = { name: 'Demo User', email: 'demo.user@contoso.com' };
  let signedIn = false;
  const latency = () => new Promise(r => setTimeout(r, 0));
  const copy = it => it && { ...it, fields: { ...it.fields } };
  const childrenOf = path => [...items.values()].filter(it => it.path === path)
    .sort((a, b) => (b.isFolder - a.isFolder) || a.name.localeCompare(b.name));
  const workbookItem = (path, w) => ({
    id: `W${hashId(path)}`, driveId: DEMO_DRIVE, name: path.split('/').at(-1), webUrl: `${DEMO_LIBRARY_URL}/${urlPath(path)}`,
    isFolder: false, size: w.json.length, lastModified: w.lastModified, lastModifiedBy: w.lastModifiedBy, createdBy: w.createdBy,
    version: `${w.n}.0`, eTag: w.eTag, path: path.split('/').slice(0, -1).join('/'), kind: 'other', extension: extensionOf(path), fields: {},
  });
  const etagOf = (path, n) => `"{W${hashId(path)}},${n}"`;
  const trimPath = p => String(p).replace(/^\/+|\/+$/g, '');
  const savedPathOf = itemId => Object.keys(saved).find(p => `W${hashId(p)}` === itemId);

  return {
    demo: true,
    async signIn() { await latency(); signedIn = true; return { username: user.email, name: user.name }; },
    async signOut() { signedIn = false; },
    async isSignedIn() { return signedIn; },
    async whoAmI() { await latency(); return { ...user }; },
    // For the demo only: who the demo is signed in as.
    setUser(u) { user = { ...user, ...u }; },
    async listDrives(siteUrl = DEMO_SITE) {
      await latency();
      if (siteUrl && !siteUrl.toLowerCase().startsWith(DEMO_SITE.toLowerCase())) throw new NotFoundError(`Demo mode has only ${DEMO_SITE}.`);
      return [{ id: DEMO_DRIVE, name: 'Documents', webUrl: DEMO_LIBRARY_URL, driveType: 'documentLibrary' }];
    },
    async listChildren(driveId = DEMO_DRIVE, itemId) {
      await latency();
      if (driveId !== DEMO_DRIVE) throw new NotFoundError('No such library in demo mode.');
      if (!itemId || itemId === 'root') return childrenOf('').map(copy);
      const folder = items.get(itemId);
      if (!folder?.isFolder) throw new NotFoundError('No such folder in demo mode.');
      return childrenOf(`${folder.path ? `${folder.path}/` : ''}${folder.name}`).map(copy);
    },
    async search(query) {
      await latency();
      const words = String(query ?? '').toLowerCase().split(/\s+/).filter(Boolean);
      if (!words.length) return [];
      return [...items.values()].filter(it => !it.isFolder && words.every(w =>
        `${it.name} ${it.path} ${Object.values(it.fields).join(' ')}`.toLowerCase().includes(w))).map(copy);
    },
    async getItem(ref) {
      if (typeof ref === 'string') return this.resolveShareUrl(ref);
      await latency();
      const it = items.get(ref?.itemId);
      if (!it) throw new NotFoundError('No such item in demo mode.');
      return copy(it);
    },
    async resolveShareUrl(url) {
      await latency();
      const want = decode(String(url).split('?')[0]).toLowerCase();
      const it = [...items.values()].find(x => decode(x.webUrl).toLowerCase() === want || x.shareUrl.toLowerCase() === want);
      if (it) return copy(it);
      const p = parseDocUrl(url);
      const at = trimPath(`${p.folderPath}/${p.fileName}`);
      if (p.isSharePoint && saved[at]) return workbookItem(at, saved[at]);
      throw new NotFoundError('That link doesn’t point at anything in the demo library.');
    },
    // A document's versions, newest first; a workbook's are the saves made to it.
    async listVersions(driveId, itemId) {
      await latency();
      const savedAt = savedPathOf(itemId);
      if (savedAt) return [...saved[savedAt].versions].reverse();
      const it = items.get(itemId);
      if (!it) throw new NotFoundError('No such item in demo mode.');
      const n = Math.round(Number(it.version ?? 1));
      return Array.from({ length: n }, (_, i) => ({ id: `${n - i}.0`, lastModified: it.lastModified, lastModifiedBy: it.lastModifiedBy, size: it.size }));
    },
    async loadWorkbook(path) {
      await latency();
      const p = trimPath(path);
      const w = saved[p];
      if (!w) throw new NotFoundError(`There’s no workbook at ${path} in the demo library yet.`);
      return { json: w.json, eTag: w.eTag, item: workbookItem(p, w) };
    },
    async saveWorkbook(path, json, eTag) {
      await latency();
      const p = trimPath(path);
      const body = typeof json === 'string' ? json : JSON.stringify(json);
      const w = saved[p];
      if (w && w.eTag !== eTag) throw new ConflictError(`${w.lastModifiedBy} saved it since it was opened.`, { status: 412, current: workbookItem(p, w) });
      if (!w && eTag) throw new NotFoundError(`There’s no workbook at ${path} to save over.`);
      const n = (w?.n ?? 0) + 1;
      const now = new Date().toISOString();
      saved[p] = { json: body, n, eTag: etagOf(p, n), lastModified: now, lastModifiedBy: user.name, createdBy: w?.createdBy ?? user.name,
        versions: [...(w?.versions ?? []), { id: `${n}.0`, lastModified: now, lastModifiedBy: user.name, size: body.length }] };
      persist();
      return { eTag: saved[p].eTag, item: workbookItem(p, saved[p]) };
    },
    // For the demo only: another user saving the workbook, to show what a conflict looks like.
    touch(path, by = 'Margaret A. Chen') {
      const p = trimPath(path), w = saved[p];
      if (!w) return;
      const n = w.n + 1, now = new Date().toISOString();
      saved[p] = { ...w, n, eTag: etagOf(p, n), lastModified: now, lastModifiedBy: by, versions: [...w.versions, { id: `${n}.0`, lastModified: now, lastModifiedBy: by, size: w.json.length }] };
      persist();
    },
    // For the demo only: forget what was saved.
    clear() { saved = {}; persist(); },
    // Every document in the demo library, for a sample chart to link to.
    documents: () => [...items.values()].filter(it => !it.isFolder).map(copy),
  };
}

// ---- The connector ----
// Demo until a tenant and app registration are configured and live mode is chosen. Everything is async,
// and every failure is one of the errors above.

const connector = (() => {
  let config = loadConfig();
  let demo = null, live = null, auth = null;
  const getConfig = () => config;
  const mode = () => config.mode === 'live' && config.tenantId && config.clientId && config.siteUrl ? 'live' : 'demo';
  const client = () => {
    if (mode() === 'demo') return demo ??= createDemoClient();
    auth ??= createMsalAuth(getConfig);
    return live ??= createGraphClient({ getToken: (s, o) => auth.getToken(s, o), config: getConfig });
  };
  const delegate = name => (...args) => client()[name](...args);
  return {
    // Stores the settings (any of tenantId, clientId, redirectUri, siteUrl, library, workbookFolder, mode)
    // and starts afresh with them.
    configure(changes) {
      config = { ...config, ...changes };
      storeConfig(config);
      live = null;
      auth?.reset();
      auth = null;
      return { ...config };
    },
    config: () => ({ ...config }),
    mode,
    isDemo: () => mode() === 'demo',
    // The demo client itself, for its demo-only helpers (touch, clear, documents, setUser).
    get demo() { return demo ??= createDemoClient(); },
    signIn: () => (mode() === 'demo' ? client().signIn() : (auth ??= createMsalAuth(getConfig)).signIn()),
    signOut: () => (mode() === 'demo' ? client().signOut() : (auth ??= createMsalAuth(getConfig)).signOut()),
    isSignedIn: () => (mode() === 'demo' ? client().isSignedIn() : (auth ??= createMsalAuth(getConfig)).isSignedIn()),
    whoAmI: delegate('whoAmI'),
    listDrives: delegate('listDrives'),
    listChildren: delegate('listChildren'),
    search: delegate('search'),
    getItem: delegate('getItem'),
    resolveShareUrl: delegate('resolveShareUrl'),
    listVersions: delegate('listVersions'),
    loadWorkbook: delegate('loadWorkbook'),
    saveWorkbook: delegate('saveWorkbook'),
    // Where workbooks go in the library, for a chart's name.
    workbookPath: name => `${config.workbookFolder || 'Rboreal'}/${String(name).replace(/[\\/:*?"<>|#%]+/g, '-').trim() || 'Workbook'}.rboreal.json`,
  };
})();

return {
  parseDocUrl, docIcon, kindOfName, connector, createGraphClient, createMsalAuth, shareToken,
  ConflictError, AuthError, NotConfiguredError, NotFoundError, GraphError, SharePointError,
  DEMO: { site: DEMO_SITE, library: DEMO_LIBRARY_URL, drive: DEMO_DRIVE },
};

})();
