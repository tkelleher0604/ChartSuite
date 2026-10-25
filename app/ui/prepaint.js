// Loaded in <head>, before first paint: applies the chosen theme, and whether the sidebar is hidden, so a
// page never flashes the wrong one. "system" leaves the theme to the OS setting. Reads what common.js saves.
try {
  const prefs = JSON.parse(localStorage.getItem('rboreal.prefs'));
  if (prefs?.theme === 'light' || prefs?.theme === 'dark') document.documentElement.dataset.theme = prefs.theme;
  if (prefs?.sidebar === false) document.documentElement.dataset.sidebar = 'hidden';
} catch {}
