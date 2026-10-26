// Stand-ins for what the store and the SharePoint connector talk to, for store-test.html: Microsoft Graph,
// answering as fetch does; MSAL; and a handle on a file that several people can have open at once.

// A tenant with one site and one library, its files kept in memory. fetch(url, options) answers requests
// to Graph and to the library's download addresses, and passes anything else to `fallback`. `latency`
// spaces the answers out, so that saves interleave; `offline` fails every request as a dropped connection
// does; `before`, if set, runs once just before the next write is taken, as someone saving in between
// would; `log` lists each request as "METHOD path status".
function fakeGraph(fallback) {
  const host = 'fundlegal.sharepoint.com', site = '/sites/FundLegal', drive = 'b!fundlegal', items = new Map();
  const g = { host, drive, items, latency: 0, offline: false, before: null, log: [] };
  let next = 0;
  const pathOf = it => it.parent ? [pathOf(items.get(it.parent)), it.name].filter(Boolean).join('/') : '';
  const web = it => `https://${host}${site}/Shared%20Documents${pathOf(it) ? `/${pathOf(it).split('/').map(encodeURIComponent).join('/')}` : ''}`;
  const etag = it => `"{${it.id}},${it.v}"`;
  // A file (with its text) or a folder (without), in a folder.
  g.add = (parent, name, text, by = 'Margaret Chen') => {
    const it = { id: `item${++next}`, parent: parent?.id ?? null, name, v: 1, modified: new Date().toISOString(), by, ...(text == null ? { folder: true } : { text }) };
    items.set(it.id, it);
    return it;
  };
  // Someone else saving a file.
  g.save = (it, text, by = 'Margaret Chen') => Object.assign(it, { text, v: it.v + 1, modified: new Date().toISOString(), by });
  g.find = path => [...items.values()].find(it => it.parent && pathOf(it) === path);
  g.link = web;
  const root = g.root = g.add(null, '');
  const json = it => ({
    id: it.id, name: it.name || 'root', eTag: etag(it), webUrl: web(it), size: it.text?.length ?? 0,
    lastModifiedDateTime: it.modified, lastModifiedBy: { user: { displayName: it.by } },
    parentReference: { driveId: drive, ...(it.parent && { id: it.parent }) },
    ...(it.folder ? { folder: { childCount: [...items.values()].filter(x => x.parent === it.id).length } }
      : { file: { mimeType: 'application/json' }, '@microsoft.graph.downloadUrl': `https://download.${host}/${it.id}?v=${it.v}` }),
    listItem: { fields: { _UIVersionString: `${it.v}.0` } },
  });
  const reply = (status, body) => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  const error = (status, code) => reply(status, { error: { code, message: code } });
  const child = (at, name) => [...items.values()].find(x => x.parent === at.id && x.name.toLowerCase() === name.toLowerCase());
  const unshare = t => new TextDecoder().decode(Uint8Array.from(atob(t.slice(2).replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0)));

  function answer(u, method, options) {
    let m;
    if (u.hostname === `download.${host}`) { const it = items.get(u.pathname.slice(1)); return it ? reply(200, it.text) : error(404, 'itemNotFound'); }
    if (!/^Bearer \S/.test(options.headers?.Authorization ?? '')) return error(401, 'InvalidAuthenticationToken');
    const p = decodeURIComponent(u.pathname.replace(/^\/v1\.0/, ''));
    if ((m = /^\/sites\/([^/:]+)(?::(\/.*))?$/.exec(p)))
      return m[1] === host && m[2] === site ? reply(200, { id: 'site-fundlegal', webUrl: `https://${host}${site}` }) : error(404, 'itemNotFound');
    if (p === '/sites/site-fundlegal/drives') return reply(200, { value: [{ id: drive, name: 'Documents', webUrl: `https://${host}${site}/Shared%20Documents` }] });
    if ((m = /^\/shares\/([^/]+)\/driveItem$/.exec(p))) {
      const want = decodeURI(unshare(m[1]).split('?')[0]).toLowerCase(), it = [...items.values()].find(x => decodeURI(web(x)).toLowerCase() === want);
      return it ? reply(200, json(it)) : error(404, 'itemNotFound');
    }
    if (!(m = /^\/drives\/([^/]+)\/(.*)$/.exec(p)) || m[1] !== drive) return error(404, 'itemNotFound');
    const r = m[2];
    if ((m = /^root\/search\(q='(.*)'\)$/.exec(r))) {
      const q = m[1].replace(/''/g, "'").toLowerCase();
      return reply(200, { value: [...items.values()].filter(it => it.parent && it.name.toLowerCase().includes(q)).map(json) });
    }
    const [, base, path, tail] = /^(root|items\/[^/:]+)(?::\/(.*?))?(?::?\/(content|children))?$/.exec(r) ?? [];
    let at = base === 'root' ? root : items.get(base?.slice(6));
    if (!at) return error(404, 'itemNotFound');
    if (method === 'PUT' && g.before) { const f = g.before; g.before = null; f(); }
    if (path != null) {
      const found = path.split('/').reduce((it, name) => it && child(it, name), at);
      if (method === 'PUT' && tail === 'content') {
        if (found && u.searchParams.get('@microsoft.graph.conflictBehavior') === 'fail') return error(409, 'nameAlreadyExists');
        if (!found) return reply(201, json(g.add(at, path, options.body, g.user)));
      }
      if (!found) return error(404, 'itemNotFound');
      at = found;
    }
    if (tail === 'children') return reply(200, { value: [...items.values()].filter(x => x.parent === at.id).map(json) });
    if (tail === 'content' && method === 'PUT') {
      const want = options.headers['If-Match'];
      if (want && want !== etag(at)) return error(412, 'resourceModified');
      return reply(200, json(g.save(at, options.body, g.user)));
    }
    return reply(200, json(at));
  }
  g.user = 'Ann Lee';
  g.fetch = async (url, options = {}) => {
    const u = new URL(url, location.href);
    if (u.hostname !== 'graph.microsoft.com' && u.hostname !== `download.${host}`) return fallback(url, options);
    await new Promise(r => setTimeout(r, g.latency));
    if (g.offline) throw new TypeError('Failed to fetch');
    const method = options.method ?? 'GET', res = answer(u, method, options);
    g.log.push(`${method} ${decodeURIComponent(u.pathname.replace(/^\/v1\.0/, ''))} ${res.status}`);
    return res;
  };
  return g;
}

// MSAL, as far as sharepoint.js uses it. Its account is kept across every page, as MSAL's cache is.
const FakeMsal = (() => {
  let signedIn = null;
  class InteractionRequiredAuthError extends Error {}
  class PublicClientApplication {
    constructor(config) { FakeMsal.config = config; this.active = null; }
    async initialize() {}
    async handleRedirectPromise() { return null; }
    getAllAccounts() { return signedIn ? [signedIn] : []; }
    getActiveAccount() { return signedIn && this.active; }
    setActiveAccount(a) { this.active = a; }
    async loginPopup(request) {
      FakeMsal.scopes.push(...request.scopes);
      signedIn = { name: FakeMsal.user, username: 'ann.lee@fundlegal.example' };
      return { account: signedIn };
    }
    async logoutPopup() { signedIn = null; this.active = null; }
    async acquireTokenSilent(request) {
      if (!signedIn) throw new InteractionRequiredAuthError('interaction_required');
      FakeMsal.scopes.push(...request.scopes);
      return { accessToken: `token for ${request.scopes.join(' ')}` };
    }
  }
  return { PublicClientApplication, InteractionRequiredAuthError, user: 'Ann Lee', scopes: [], config: null };
})();

// A handle on a file on `disk` ({ text, modified }), which other people's handles can share. Its leave to
// write is `permission`, which requestPermission sets to `grant`. Each step takes a moment, so that two
// people's saves can interleave.
class FakeHandle {
  constructor(disk, name = 'Calder Ridge.dendra.json') {
    this.kind = 'file';
    this.name = name;
    this.disk = disk;
    this.permission = 'granted';
    this.grant = 'granted';
  }
  async getFile() {
    await FakeHandle.moment();
    return new File([this.disk.text], this.name, { lastModified: this.disk.modified });
  }
  async createWritable() {
    await FakeHandle.moment();
    let body = '';
    return {
      write: async t => { body += t; },
      abort: async () => { this.disk.aborted = (this.disk.aborted ?? 0) + 1; },
      close: async () => { await FakeHandle.moment(); Object.assign(this.disk, { text: body, modified: this.disk.modified + 1, writes: (this.disk.writes ?? 0) + 1 }); },
    };
  }
  async queryPermission() { return this.permission; }
  async requestPermission() { return this.permission = this.grant; }
  async isSameEntry(h) { return h === this; }
  static moment() { return new Promise(r => setTimeout(r, 1 + Math.floor(Math.random() * 4))); }
}
