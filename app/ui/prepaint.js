// Loaded in <head>, before first paint: applies the chosen theme, and whether the sidebar is hidden, so a
// page never flashes the wrong one. "system" leaves the theme to the OS setting. The sidebar is shown on every
// page alike, as last chosen, except on a canvas (a page whose <html> has data-canvas), which starts without
// it and keeps a choice of its own. Reads what common.js saves; the shell reads the same.
try {
  const prefs = JSON.parse(localStorage.getItem('rboreal.prefs'));
  if (prefs?.theme === 'light' || prefs?.theme === 'dark') document.documentElement.dataset.theme = prefs.theme;
  const shown = 'canvas' in document.documentElement.dataset
    ? prefs?.sidebarByPage?.[location.pathname.split('/').pop() || 'index.html'] ?? false
    : prefs?.sidebar !== false;
  if (!shown) document.documentElement.dataset.sidebar = 'hidden';
} catch {}
