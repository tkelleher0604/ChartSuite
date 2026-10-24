// Helpers shared by every Rboreal page: text, icons, checkboxes and per-viewer preferences.

const esc = s => String(s).replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);

const clean = s => String(s ?? '').trim().replace(/\s+/g, ' ');
const norm = s => clean(s).toLowerCase();
const same = (a, b) => norm(a) === norm(b);
const byLabel = (a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' });
const plural = word => /[^aeiou]y$/i.test(word) ? `${word.slice(0, -1)}ies` : /(s|x|ch|sh)$/i.test(word) ? `${word}es` : `${word}s`;
const count = (n, word) => `${n} ${n === 1 ? word : plural(word)}`;

// Inner markup of Tabler outline icons; most are in ../vendor/tabler-icons/outline/.
const ICONS = {
  'alert-triangle': '<path d="M12 9v4" /><path d="M10.363 3.591l-8.106 13.534a1.914 1.914 0 0 0 1.636 2.871h16.214a1.914 1.914 0 0 0 1.636 -2.87l-8.106 -13.536a1.914 1.914 0 0 0 -3.274 0" /><path d="M12 16h.01" />',
  'arrow-back-up': '<path d="M9 14l-4 -4l4 -4" /><path d="M5 10h11a4 4 0 1 1 0 8h-1" />',
  'arrow-forward-up': '<path d="M15 14l4 -4l-4 -4" /><path d="M19 10h-11a4 4 0 1 0 0 8h1" />',
  'arrow-right': '<path d="M5 12l14 0" /><path d="M13 18l6 -6" /><path d="M13 6l6 6" />',
  'arrows-left-right': '<path d="M21 17l-18 0" /><path d="M6 10l-3 -3l3 -3" /><path d="M3 7l18 0" /><path d="M18 20l3 -3l-3 -3" />',
  'bold': '<path d="M7 5h6a3.5 3.5 0 0 1 0 7h-6l0 -7" /><path d="M13 12h1a3.5 3.5 0 0 1 0 7h-7v-7" />',
  'check': '<path d="M5 12l5 5l10 -10" />',
  'chevron-down': '<path d="M6 9l6 6l6 -6" />',
  'chevron-right': '<path d="M9 6l6 6l-6 6" />',
  'dots': '<path d="M4 12a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" /><path d="M11 12a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" /><path d="M18 12a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" />',
  'grip-vertical': '<path d="M8 5a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" /><path d="M8 12a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" /><path d="M8 19a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" /><path d="M14 5a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" /><path d="M14 12a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" /><path d="M14 19a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" />',
  'italic': '<path d="M11 5l6 0" /><path d="M7 19l6 0" /><path d="M14 5l-4 14" />',
  'link': '<path d="M9 15l6 -6" /><path d="M11 6l.463 -.536a5 5 0 0 1 7.071 7.072l-.534 .464" /><path d="M13 18l-.397 .534a5.068 5.068 0 0 1 -7.127 0a4.972 4.972 0 0 1 0 -7.071l.524 -.463" />',
  'lock': '<path d="M5 13a2 2 0 0 1 2 -2h10a2 2 0 0 1 2 2v6a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2v-6" /><path d="M11 16a1 1 0 1 0 2 0a1 1 0 0 0 -2 0" /><path d="M8 11v-4a4 4 0 1 1 8 0v4" />',
  'minus': '<path d="M5 12l14 0" />',
  'pencil': '<path d="M4 20h4l10.5 -10.5a2.828 2.828 0 1 0 -4 -4l-10.5 10.5v4" /><path d="M13.5 6.5l4 4" />',
  'plus': '<path d="M12 5l0 14" /><path d="M5 12l14 0" />',
  'trash': '<path d="M4 7l16 0" /><path d="M10 11l0 6" /><path d="M14 11l0 6" /><path d="M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2 -2l1 -12" /><path d="M9 7v-3a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v3" />',
  'x': '<path d="M18 6l-12 12" /><path d="M6 6l12 12" />',
};
const icon = (name, cls = '') =>
  `<svg class="icon ${cls}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;

// A tag's state as a filled checkbox: checked when attested, crossed out when ruled out.
// An empty outline stands for a tag that isn't recorded either way.
const BOX_MARKS = { true: '<path d="M4.6 8.2l2.3 2.3l4.6 -4.9" />', false: '<path d="M5.4 5.4l5.2 5.2" /><path d="M10.6 5.4l-5.2 5.2" />' };
const box = yes => yes === null
  ? '<svg class="box box-none" viewBox="0 0 16 16" aria-hidden="true"><rect x="1.5" y="1.5" width="13" height="13" rx="3.5" /></svg>'
  : `<svg class="box box-${yes ? 'yes' : 'no'}" viewBox="0 0 16 16" aria-hidden="true"><rect x="1" y="1" width="14" height="14" rx="4" />${BOX_MARKS[yes]}</svg>`;
// The clickable version, which shows the other state on hover. An unrecorded one previews being attested.
const checkbox = (yes, attrs) => {
  const next = yes === null ? true : !yes;
  const label = yes === null ? 'Not recorded; attest it' : yes ? 'Attested; rule it out' : 'Ruled out; attest it';
  const title = yes === null ? 'Click to attest it' : yes ? 'Click to rule it out' : 'Click to attest it';
  return `<button class="check" ${attrs} aria-label="${label}" title="${title}">
    <span class="check-now">${box(yes)}</span><span class="check-next">${box(next)}</span></button>`;
};

// ---- Per-viewer preferences ----

const PREFS_KEY = 'rboreal.record-panel.prefs';

function loadPrefs() {
  const prefs = { theme: 'system' };
  try { Object.assign(prefs, JSON.parse(localStorage.getItem(PREFS_KEY))); } catch {}
  return prefs;
}
function savePrefs() {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch {}
}
const prefs = loadPrefs();

function applyTheme() {
  if (prefs.theme === 'system') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = prefs.theme;
}

// A segmented control bound to a preference.
const seg = (label, key, choices) =>
  `<span class="seg-wrap">${label ? `<span>${label}</span>` : ''}<span class="seg" role="group" aria-label="${label || key}">${choices.map(([value, text]) =>
    `<button data-action="pref" data-key="${key}" data-value="${value}" aria-pressed="${prefs[key] === value}">${text}</button>`).join('')}</span></span>`;

const themeSwitch = () => seg('Theme', 'theme', [['system', 'System'], ['light', 'Light'], ['dark', 'Dark']]);

const isMac = /Mac|iPhone|iPad/.test(navigator.platform);
const undoKey = isMac ? '⌘Z' : 'Ctrl+Z';
const redoKey = isMac ? '⇧⌘Z' : 'Ctrl+Y';
