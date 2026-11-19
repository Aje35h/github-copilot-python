// Applies a saved theme before the first paint to avoid a light-theme flash.
// Mirrors THEME_KEY and the allowed values in theme.js; main.js applies the
// theme again on load, so the page still works if this script fails.
(function applySavedTheme() {
  try {
    const theme = window.localStorage.getItem('sudoku.theme.v1');
    if (theme === 'light' || theme === 'dark') {
      document.documentElement.dataset.theme = theme;
    }
  } catch {
    // Storage is blocked; the page starts in light mode.
  }
})();
