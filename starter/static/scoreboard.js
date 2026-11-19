// Pure Top 10 scoreboard helpers. Stored data is untrusted: every score is
// validated and rebuilt from the allowed fields before it is used or saved.
import { isAllowedDifficulty } from './sudoku_rules.js';
import { formatElapsed } from './game_timer.js';
import { normalizePlayerName } from './player_name.js';

export const SCOREBOARD_KEY = 'sudoku.scoreboard.v1';
export const SCHEMA_VERSION = 1;
export const MAX_SCORES = 10;
export const MAX_SECONDS = 86399;
export const MAX_HINTS = 81;
export const MAX_STORED_LENGTH = 8192;

/** Accept whole seconds from 0 through 86,399 (just under 24 hours). */
export function isRecordableSeconds(seconds) {
  return Number.isSafeInteger(seconds) && seconds >= 0 && seconds <= MAX_SECONDS;
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function ownValue(source, key) {
  return Object.hasOwn(source, key) ? source[key] : undefined;
}

/** Return a new score with only the allowed fields, or null if any is invalid. */
export function sanitizeScore(value) {
  if (!isPlainObject(value)) {
    return null;
  }
  const name = normalizePlayerName(ownValue(value, 'name'));
  const seconds = ownValue(value, 'seconds');
  const difficulty = ownValue(value, 'difficulty');
  const hintsUsed = ownValue(value, 'hintsUsed');
  const completedAt = ownValue(value, 'completedAt');
  if (
    name === null ||
    !isRecordableSeconds(seconds) ||
    !isAllowedDifficulty(difficulty) ||
    !Number.isSafeInteger(hintsUsed) ||
    hintsUsed < 0 ||
    hintsUsed > MAX_HINTS ||
    !Number.isSafeInteger(completedAt) ||
    completedAt <= 0
  ) {
    return null;
  }
  return { name, seconds, difficulty, hintsUsed, completedAt };
}

function compareValues(left, right) {
  if (left < right) {
    return -1;
  }
  return left > right ? 1 : 0;
}

/**
 * Order by seconds, then fewer hints, then earlier completion, then name.
 * Names use code-unit order so the result is the same in every locale.
 */
export function compareScores(left, right) {
  return (
    compareValues(left.seconds, right.seconds) ||
    compareValues(left.hintsUsed, right.hintsUsed) ||
    compareValues(left.completedAt, right.completedAt) ||
    compareValues(left.name, right.name)
  );
}

/** Return a new sorted list with at most ten scores. */
export function rankScores(scores) {
  return scores.slice().sort(compareScores).slice(0, MAX_SCORES);
}

/** Return the new Top 10 and the score's 1-based rank, or null if it did not place. */
export function insertScore(scores, score) {
  const clean = sanitizeScore(score);
  if (clean === null) {
    throw new TypeError('score is not valid.');
  }
  const ranked = rankScores([...scores, clean]);
  const index = ranked.indexOf(clean);
  return { scores: ranked, rank: index === -1 ? null : index + 1 };
}

/** Parse stored text into valid, sorted scores. Never throws. */
export function parseStoredScores(raw) {
  if (typeof raw !== 'string' || raw.length > MAX_STORED_LENGTH) {
    return [];
  }
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return [];
  }
  if (
    !isPlainObject(data) ||
    ownValue(data, 'version') !== SCHEMA_VERSION ||
    !Array.isArray(ownValue(data, 'scores'))
  ) {
    return [];
  }
  return rankScores(data.scores.map(sanitizeScore).filter((score) => score !== null));
}

export function serializeScores(scores) {
  const clean = scores.map(sanitizeScore).filter((score) => score !== null);
  return JSON.stringify({ version: SCHEMA_VERSION, scores: rankScores(clean) });
}

/** Read the scoreboard. Loading never writes, even if stored data was invalid. */
export function loadScores(storage) {
  try {
    return { scores: parseStoredScores(storage.getItem(SCOREBOARD_KEY)), available: true };
  } catch {
    return { scores: [], available: false };
  }
}

export function saveScores(storage, scores) {
  try {
    storage.setItem(SCOREBOARD_KEY, serializeScores(scores));
    return true;
  } catch {
    return false;
  }
}

/**
 * Re-read storage, insert one score, and save the result.
 * Returns { status, rank, scores } where status is 'saved', 'not-ranked',
 * 'invalid', or 'unavailable'.
 */
export function recordScore(storage, score) {
  if (sanitizeScore(score) === null) {
    return { status: 'invalid', rank: null, scores: [] };
  }
  const current = loadScores(storage);
  if (!current.available) {
    return { status: 'unavailable', rank: null, scores: [] };
  }
  const { scores, rank } = insertScore(current.scores, score);
  if (rank === null) {
    return { status: 'not-ranked', rank: null, scores };
  }
  if (!saveScores(storage, scores)) {
    return { status: 'unavailable', rank: null, scores: current.scores };
  }
  return { status: 'saved', rank, scores };
}

function plural(count, word) {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

const OUTCOME_MESSAGES = Object.freeze({
  'not-ranked': 'Your time did not make the Top 10.',
  'too-long': "Games longer than 24 hours aren't recorded.",
  unavailable: 'Your score could not be saved because browser storage is unavailable.',
  invalid: 'Your score could not be recorded.',
});

/** Build the completion announcement for a solved puzzle. */
export function formatCompletionMessage({ seconds, hintsUsed, status, rank }) {
  const solved = `Congratulations! You solved the puzzle in ${formatElapsed(seconds)} with ${plural(hintsUsed, 'hint')}.`;
  const outcome = status === 'saved'
    ? `Your time ranks #${rank} in the Top 10.`
    : OUTCOME_MESSAGES[status] ?? OUTCOME_MESSAGES.invalid;
  return `${solved} ${outcome}`;
}

export function formatDifficulty(difficulty) {
  return difficulty.charAt(0).toUpperCase() + difficulty.slice(1);
}
