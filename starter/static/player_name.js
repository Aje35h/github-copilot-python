// Pure player-name rules and storage helpers. Storage is passed in so the
// browser can use localStorage and tests can use an in-memory fake.

export const PLAYER_NAME_KEY = 'sudoku.playerName.v1';
export const MIN_NAME_LENGTH = 1;
export const MAX_NAME_LENGTH = 30;
export const MAX_STORED_NAME_LENGTH = 256;
export const FALLBACK_NAME = 'Anonymous';

const CONTROL_CHARACTER = /\p{Cc}/u;

/**
 * Return the trimmed name if it has 1-30 characters and no control
 * characters, otherwise null. Emoji and other astral characters count once.
 */
export function normalizePlayerName(raw) {
  if (typeof raw !== 'string') {
    return null;
  }
  const trimmed = raw.trim();
  if (CONTROL_CHARACTER.test(trimmed)) {
    return null;
  }
  const length = [...trimmed].length;
  return length >= MIN_NAME_LENGTH && length <= MAX_NAME_LENGTH ? trimmed : null;
}

/** Return a valid name for a score, falling back to "Anonymous". */
export function resolvePlayerName(raw) {
  return normalizePlayerName(raw) ?? FALLBACK_NAME;
}

/** Return the remembered name, or null if it is missing, invalid, or unreadable. */
export function loadPlayerName(storage) {
  let raw;
  try {
    raw = storage.getItem(PLAYER_NAME_KEY);
  } catch {
    return null;
  }
  if (typeof raw !== 'string' || raw.length > MAX_STORED_NAME_LENGTH) {
    return null;
  }
  return normalizePlayerName(raw);
}

/**
 * Remember a valid name, or forget it when the field is empty.
 * Returns 'saved', 'cleared', 'invalid', or 'unavailable'.
 */
export function savePlayerName(storage, raw) {
  if (typeof raw === 'string' && raw.trim() === '') {
    try {
      storage.removeItem(PLAYER_NAME_KEY);
      return 'cleared';
    } catch {
      return 'unavailable';
    }
  }
  const name = normalizePlayerName(raw);
  if (name === null) {
    return 'invalid';
  }
  try {
    storage.setItem(PLAYER_NAME_KEY, name);
    return 'saved';
  } catch {
    return 'unavailable';
  }
}
