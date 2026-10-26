// Dendra's launch screen: leaf shadows moving on a sunlit wall, from UI/mockups/Dappled Wall.html with its
// controls, fonts and fallback text taken out, and the mark cut out of it in the page's paper. The head
// script decides whether it shows (html[data-splash], once a tab, when Dendra is opened in a new tab or
// window) and covers the page in the wall's shade before first paint; this, the first script in <body>
// after the mark's symbol, draws the wall and lifts the cover. It holds for at least HOLD ms after its first
// frame (less after the day's first launch) and ends when the shell calls Splash.done(), on a click or a
// key, or after LIMIT ms whatever happens. Then the light goes down to the paper as the wall fades, and the
// WebGL context is released. By moonlight in the dark theme; a still frame and a short fade with reduced
// motion. Splash.ended resolves once it's gone.

const Splash = (() => {
  const LIMIT = 4000, OUT = 650;
  const root = document.documentElement;
  if (!root.hasAttribute('data-splash')) return { done() {}, ended: Promise.resolve() };
  let HOLD = 900;
  try { const day = new Date().toDateString(); if (localStorage.getItem('dendra.launchedOn') === day) HOLD = 500; localStorage.setItem('dendra.launchedOn', day); } catch {}

  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const dark = root.dataset.theme === 'dark';
  // The wall's shade and its sunlight; by moonlight in the dark theme, so the fade lands on a dark page.
  const SHADE = dark ? [0.066, 0.075, 0.082] : [0.447, 0.498, 0.584];
  const SUN = dark ? [0.215, 0.235, 0.26] : [0.949, 0.812, 0.627];
  const fade = still ? 200 : OUT;

  const veil = document.createElement('div');
  veil.setAttribute('aria-hidden', 'true');
  veil.style.cssText = `position:fixed;inset:0;z-index:2147483647;background:rgb(${SHADE.map(c => c * 255 | 0)});transition:opacity ${fade}ms ease-out`;
  const cv = document.createElement('canvas');
  cv.style.cssText = 'display:block;width:100%;height:100%';
  veil.appendChild(cv);
  // The mark, a little above the middle: in the paper by day, and by moonlight in the ink.
  veil.insertAdjacentHTML('beforeend', `<svg viewBox="0 0 16 16" style="position:absolute;left:50%;top:45%;width:40px;height:40px;margin:-20px 0 0 -20px;color:color-mix(in srgb, var(${dark ? '--ink' : '--paper'}) ${dark ? 60 : 70}%, transparent)"><use href="#mark"/></svg>`);
  document.body.prepend(veil);
  root.removeAttribute('data-splash');

  let finish;
  const ended = new Promise(r => { finish = r; });
  const gl = cv.getContext('webgl', { antialias: false, alpha: false, depth: false, stencil: false });
  const quit = new AbortController();
  let started = 0, ready = false, ending = false, raf = 0;
  const end = () => {
    if (ending) return;
    ending = true;
    quit.abort();
    veil.style.pointerEvents = 'none';
    const t0 = performance.now(), paper = getComputedStyle(document.body).backgroundColor.match(/\d+/g).slice(0, 3).map(n => n / 255);
    if (gl && !still) dim(t0, paper);
    veil.style.opacity = '0';
    setTimeout(() => { cancelAnimationFrame(raf); gl?.getExtension('WEBGL_lose_context')?.loseContext(); veil.remove(); finish(); }, fade + 50);
  };
  const later = () => setTimeout(end, Math.max(0, HOLD - (performance.now() - (started || performance.now()))));
  addEventListener('pointerdown', end, { capture: true, signal: quit.signal });
  addEventListener('keydown', e => { e.stopPropagation(); e.preventDefault(); end(); }, { capture: true, signal: quit.signal });
  setTimeout(end, LIMIT);
  if (!gl) { started = performance.now(); return { done: later, ended }; }

  // ---- From Dappled Wall.html: noise, wind, the shader, the trees and their swaying. Unchanged.
  function h1(i) { i = (i | 0) ^ 0x9e3779b9; i = Math.imul(i ^ (i >>> 16), 0x85ebca6b); i = Math.imul(i ^ (i >>> 13), 0xc2b2ae35); i ^= i >>> 16; return (i >>> 0) / 4294967295 * 2 - 1; }
  function vn(x) { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); const a = h1(i), b = h1(i + 1); return a + (b - a) * u; }
  function fbm(x) { return vn(x) * 0.6 + vn(x * 2.13 + 17.3) * 0.3 + vn(x * 4.31 + 3.1) * 0.15; }
  function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  let WX = 0, WY = 0, WG = 0;
  function windAt(te) {
    const g0 = vn(te * 0.07 + 11) * 0.5 + 0.5, gust = 0.22 + 0.78 * g0 * g0 * (3 - 2 * g0);
    WX = gust * (0.6 + 0.55 * fbm(te * 0.45)); WY = gust * 0.45 * fbm(te * 0.37 + 29); WG = gust;
  }
  const mask = document.createElement('canvas'), mx = mask.getContext('2d');
  const VS = 'attribute vec2 p;varying vec2 vUv;void main(){vUv=p*0.5+0.5;gl_Position=vec4(p,0.,1.);}';
  const FS = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
varying vec2 vUv;uniform sampler2D uMask;uniform vec2 uPx;uniform vec3 uRad;uniform float uGrain;uniform vec3 uShadow;uniform vec3 uSun;
float hash(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
void main(){vec2 uv=vUv;float j=hash(gl_FragCoord.xy)*6.2831853;float n=0.0,f=0.0,s=0.0;
for(int i=0;i<10;i++){float fi=float(i);float r=sqrt((fi+0.5)/10.0);float a=fi*2.3999632+j;n+=texture2D(uMask,uv+vec2(cos(a),sin(a))*r*uRad.x*uPx).r;}
for(int i=0;i<28;i++){float fi=float(i);float r=sqrt((fi+0.5)/28.0);float a=fi*2.3999632+j;f+=texture2D(uMask,uv+vec2(cos(a),sin(a))*r*uRad.y*uPx).g;}
for(int i=0;i<12;i++){float fi=float(i);float r=sqrt((fi+0.5)/12.0);float a=fi*2.3999632+j;s+=texture2D(uMask,uv+vec2(cos(a),sin(a))*r*uRad.z*uPx).b;}
n/=10.0;f/=28.0;s/=12.0;float light=(1.0-n)*(1.0-f)*(1.0-s);float l=smoothstep(0.06,0.92,light);
float reach=0.9+0.16*(vUv.x*0.55+vUv.y*0.45);vec3 col=uShadow+(uSun-uShadow)*l*reach;col+=vec3(0.05,0.04,0.02)*pow(l,5.0);
float d=length((vUv-0.5)*vec2(1.0,1.15));col*=1.0-0.16*smoothstep(0.38,0.9,d);col+=(hash(gl_FragCoord.xy+uGrain)-0.5)*0.05;gl_FragColor=vec4(col,1.0);}`;
  function sh(type, src) { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; }
  const prog = gl.createProgram();
  gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS));
  gl.linkProgram(prog); gl.useProgram(prog);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
  for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  const U = {};
  for (const k of ['uMask', 'uPx', 'uRad', 'uGrain', 'uShadow', 'uSun']) U[k] = gl.getUniformLocation(prog, k);
  gl.uniform1i(U.uMask, 0); gl.uniform3f(U.uShadow, ...SHADE); gl.uniform3f(U.uSun, ...SUN);

  const FAR = 0, NEAR = 1;
  const CFG = [{ maxD: 4, flex: [0.03, 0.06, 0.11, 0.18, 0.26], leaf: 0.034, thick: 0.011 }, { maxD: 4, flex: [0.025, 0.05, 0.09, 0.15, 0.22], leaf: 0.03, thick: 0.010 }];
  let W = 1, H = 1, S = 1, ds = 2, MW = 2, MH = 2, m = 1, nodes = [], leaves = [[], []], byDepth = [[], []], rng, T = Math.random() * 1000;
  const seed = (Math.random() * 1e9) | 0;
  function grow(parent, rx, ry, rel, len, thick, depth, layer) {
    const c = CFG[layer], i = nodes.length;
    nodes.push({ p: parent, rx, ry, rel, len, thick, depth, layer, ph: rng() * 100, flex: c.flex[depth] * (0.7 + 0.6 * rng()),
      w: 2 * Math.PI * (0.45 + 0.5 * depth) * (0.85 + 0.3 * rng()), cur: 0, vel: 0, ang: 0, x0: rx, y0: ry, x1: rx, y1: ry, wx: 0, wy: 0, wg: 0 });
    byDepth[layer][depth].push(i);
    if (depth >= c.maxD - 1) {
      const n = layer === FAR ? 5 + Math.floor(rng() * 4) : 2 + Math.floor(rng() * 3);
      for (let k = 0; k < n; k++) leaves[layer].push({ n: i, t: 0.15 + 0.85 * rng(), rel: (k % 2 ? 1 : -1) * (0.45 + 0.7 * rng()), L: c.leaf * (0.75 + 0.5 * rng()), wd: 0.36 + 0.14 * rng(), ph: rng() * 100, ph2: rng() * 100 });
      leaves[layer].push({ n: i, t: 1, rel: (rng() - 0.5) * 0.4, L: c.leaf * (0.8 + 0.4 * rng()), wd: 0.38, ph: rng() * 100, ph2: rng() * 100 });
    }
    if (depth < c.maxD) {
      grow(i, 0, 0, (rng() - 0.5) * 0.35, len * (0.72 + 0.12 * rng()), thick * 0.68, depth + 1, layer);
      const sides = depth === 0 ? 2 : (rng() < 0.4 ? 2 : 1);
      let sg = rng() < 0.5 ? 1 : -1;
      for (let k = 0; k < sides; k++) { grow(i, 0, 0, sg * (0.45 + 0.6 * rng()), len * (0.5 + 0.22 * rng()), thick * 0.55, depth + 1, layer); sg = -sg; }
    }
  }
  function build() {
    rng = mulberry32(seed); nodes = []; leaves = [[], []];
    byDepth = [0, 1].map(l => Array.from({ length: CFG[l].maxD + 1 }, () => []));
    const X = W / S, Y = H / S, nFar = Math.round(6 + 6 * X * Y), cols = X > Y ? 3 : 2, rows = Math.ceil(nFar / cols);
    for (let i = 0; i < nFar; i++) {
      const c = i % cols, r = Math.floor(i / cols), tx = (c + 0.15 + 0.7 * rng()) / cols * X, ty = (r + 0.15 + 0.7 * rng()) / rows * Y * 0.95, q = rng();
      let rx, ry;
      if (q < 0.38) { rx = -0.08; ry = Math.min(Y + 0.05, ty + 0.1 + rng() * 0.3); }
      else if (q < 0.62) { rx = tx + (rng() - 0.5) * 0.3; ry = -0.08; }
      else if (q < 0.86) { rx = X + 0.08; ry = ty + rng() * 0.25; }
      else { rx = tx - 0.1 - rng() * 0.2; ry = Y + 0.08; }
      grow(-1, rx, ry, Math.atan2(ty - ry, tx - rx), Math.max(0.12, Math.hypot(tx - rx, ty - ry) * 0.42), CFG[FAR].thick, 0, FAR);
    }
    for (let i = 0; i < 2; i++) {
      const rx = -0.06, ry = Y * (0.5 + 0.32 * rng()), tx = X * (0.55 + 0.4 * rng()), ty = Y * (0.2 + 0.45 * rng());
      grow(-1, rx, ry, Math.atan2(ty - ry, tx - rx), Math.hypot(tx - rx, ty - ry) * 0.45, CFG[NEAR].thick, 0, NEAR);
    }
    for (let k = 0; k < 200; k++) step(1 / 60);
  }
  const strength = still ? 0 : 0.5; // a gentle breeze, Dappled Wall's force 3
  function step(dt) {
    const idleAmp = 0.04 + 0.12 * Math.min(1, strength);
    for (const nd of nodes) {
      let x0, y0, pa;
      if (nd.p < 0) { x0 = nd.rx; y0 = nd.ry; pa = 0; } else { const P = nodes[nd.p]; x0 = P.x1; y0 = P.y1; pa = P.ang; }
      nd.x0 = x0; nd.y0 = y0;
      const base = pa + nd.rel;
      windAt(T - x0 * 1.3 - y0 * 0.3);
      nd.wx = WX * strength; nd.wy = WY * strength; nd.wg = WG * strength;
      const torque = Math.cos(base) * nd.wy - Math.sin(base) * nd.wx, turb = vn(T * (0.7 + nd.depth * 0.55) + nd.ph) * nd.wg, idle = vn(T * 0.25 + nd.ph * 1.7) * idleAmp;
      const target = nd.flex * (torque + turb * 0.9 + idle), w = nd.w;
      nd.vel += ((target - nd.cur) * w * w - nd.vel * 0.5 * w) * dt; nd.cur += nd.vel * dt; nd.ang = base + nd.cur;
      nd.x1 = x0 + Math.cos(nd.ang) * nd.len; nd.y1 = y0 + Math.sin(nd.ang) * nd.len;
    }
  }
  const HP = Math.PI / 2;
  function drawLayer(layer, color) {
    mx.strokeStyle = color; mx.fillStyle = color;
    const c = CFG[layer], bd = byDepth[layer];
    for (let d = 0; d < bd.length; d++) {
      if (!bd[d].length) continue;
      mx.lineWidth = Math.max(0.7, c.thick * Math.pow(0.64, d) * m); mx.beginPath();
      for (const i of bd[d]) { const nd = nodes[i]; mx.moveTo(nd.x0 * m, nd.y0 * m); mx.lineTo(nd.x1 * m, nd.y1 * m); }
      mx.stroke();
    }
    mx.beginPath();
    for (const lf of leaves[layer]) {
      const nd = nodes[lf.n], bx = (nd.x0 + (nd.x1 - nd.x0) * lf.t) * m, by = (nd.y0 + (nd.y1 - nd.y0) * lf.t) * m;
      let a = nd.ang + lf.rel; a += Math.atan2(Math.sin(HP - a), Math.cos(HP - a)) * 0.28;
      const g = nd.wg;
      a += vn(T * (1.4 + g * 5) + lf.ph) * (0.12 + g * 0.9) + (Math.cos(a) * nd.wy - Math.sin(a) * nd.wx) * 0.45;
      const flip = 0.4 + 0.6 * Math.abs(Math.cos(lf.ph2 + vn(T * (0.7 + g * 3) + lf.ph2) * (0.3 + g * 2.6))), L = lf.L * m, hw = L * lf.wd * flip;
      const ca = Math.cos(a), sa = Math.sin(a), tx = bx + ca * L, ty = by + sa * L, cx = bx + ca * L * 0.45, cy = by + sa * L * 0.45;
      mx.moveTo(bx, by); mx.quadraticCurveTo(cx - sa * hw, cy + ca * hw, tx, ty); mx.quadraticCurveTo(cx + sa * hw, cy - ca * hw, bx, by);
    }
    mx.fill();
  }
  function drawMask() {
    mx.globalCompositeOperation = 'source-over'; mx.fillStyle = '#000'; mx.fillRect(0, 0, MW, MH);
    mx.globalCompositeOperation = 'lighter'; mx.lineCap = 'round';
    drawLayer(FAR, '#00ff00'); drawLayer(NEAR, '#ff0000');
    mx.fillStyle = '#0000ff'; mx.beginPath(); // the window sill, low on the wall
    mx.moveTo(-4, MH * 0.866); mx.lineTo(MW + 4, MH * 0.858); mx.lineTo(MW + 4, MH * 0.974); mx.lineTo(-4, MH * 0.976); mx.closePath();
    mx.moveTo(-4, MH * 0.97); mx.lineTo(MW * 0.3, MH * 0.97); mx.lineTo(MW * 0.27, MH + 4); mx.lineTo(-4, MH + 4); mx.closePath();
    mx.moveTo(MW * 0.8, MH * 0.97); mx.lineTo(MW + 4, MH * 0.97); mx.lineTo(MW + 4, MH + 4); mx.lineTo(MW * 0.83, MH + 4); mx.closePath();
    mx.fill();
  }
  let grain = 0;
  function render() {
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, mask);
    gl.uniform2f(U.uPx, 1 / MW, 1 / MH); gl.uniform3f(U.uRad, 0.0075 * S / ds, 0.021 * S / ds, 0.009 * S / ds); gl.uniform1f(U.uGrain, (grain % 97) * 13.7);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
  // ---- New: the light goes down to the page's paper as the wall fades.
  function dim(t0, paper) {
    const k = Math.min(1, (performance.now() - t0) / OUT), e = 1 - (1 - k) ** 3, mix = (a, b) => a.map((v, i) => v + (b[i] - v) * e);
    gl.uniform3f(U.uShadow, ...mix(SHADE, paper)); gl.uniform3f(U.uSun, ...mix(SUN, paper));
    if (k < 1) requestAnimationFrame(() => dim(t0, paper));
  }
  W = cv.clientWidth || innerWidth; H = cv.clientHeight || innerHeight; S = Math.max(W, H);
  ds = Math.max(2, S / 320); MW = Math.max(2, Math.ceil(W / ds)); MH = Math.max(2, Math.ceil(H / ds)); mask.width = MW; mask.height = MH; m = S / ds;
  const k = Math.min(devicePixelRatio || 1, Math.sqrt(1.4e6 / (W * H)));
  cv.width = Math.max(1, Math.round(W * k)); cv.height = Math.max(1, Math.round(H * k)); gl.viewport(0, 0, cv.width, cv.height);
  build(); drawMask(); render();
  let last = performance.now(), acc = 0;
  function frame(now) {
    if (!started) started = now;
    const dt = Math.min(1 / 30, Math.max(0, (now - last) / 1000)); last = now; T += dt;
    step(dt); acc += dt; if (acc > 1 / 12) { acc = 0; grain++; }
    drawMask(); render();
    if (ready && now - started >= HOLD) end();
    raf = requestAnimationFrame(frame);
  }
  if (still) requestAnimationFrame(now => { started = now; });
  else raf = requestAnimationFrame(frame);
  return { done() { ready = true; if (still) later(); }, ended };
})();
