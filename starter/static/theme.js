// Pure theme rules and storage helpers. Storage is passed in so the browser
// can use localStorage and tests can use an in-memory fake.
// theme_boot.js repeats THEME_KEY and the two values because a classic
// script cannot import this module; keep them in sync.

export const THEME_KEY = 'sudoku.theme.v1';
export const THEMES = Object.freeze(['light', 'dark']);
export const DEFAULT_THEME = 'light';

/** True only for exactly "light" or "dark". */
export function isTheme(value) {
  return typeof value === 'string' && THEMES.includes(value);
}

/** Return the saved theme, or null if it is missing, invalid, or unreadable. Never writes. */
export function loadTheme(storage) {
  try {
    const value = storage.getItem(THEME_KEY);
    return isTheme(value) ? value : null;
  } catch {
    return null;
  }
}

export function resolveTheme(stored) {
  return isTheme(stored) ? stored : DEFAULT_THEME;
}

/** Save a valid theme. Returns false for an invalid theme or unavailable storage. */
export function saveTheme(storage, theme) {
  if (!isTheme(theme)) {
    return false;
  }
  try {
    storage.setItem(THEME_KEY, theme);
    return true;
  } catch {
    return false;
  }
}

export function nextTheme(theme) {
  return theme === 'light' ? 'dark' : 'light';
}
