// Loaded in <head>, before first paint: applies the chosen theme, and whether the sidebar is hidden, so a
// page never flashes the wrong one. "system" leaves the theme to the OS setting. The sidebar follows this
// page's own choice where it has one (a canvas that starts without it), else the one for every page.
// Reads what common.js saves.
try {
  const prefs = JSON.parse(localStorage.getItem('rboreal.prefs'));
  if (prefs?.theme === 'light' || prefs?.theme === 'dark') document.documentElement.dataset.theme = prefs.theme;
  const here = prefs?.sidebarByPage?.[location.pathname.split('/').pop() || 'index.html'];
  const shown = here ?? prefs?.sidebar !== false;
  if (!shown) document.documentElement.dataset.sidebar = 'hidden';
} catch {}
