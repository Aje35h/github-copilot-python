import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  MAX_SCORES,
  MAX_STORED_LENGTH,
  SCHEMA_VERSION,
  SCOREBOARD_KEY,
  compareScores,
  formatCompletionMessage,
  formatDifficulty,
  insertScore,
  isRecordableSeconds,
  loadScores,
  parseStoredScores,
  rankScores,
  recordScore,
  sanitizeScore,
  saveScores,
  serializeScores,
} from '../../static/scoreboard.js';
import { createFakeStorage } from './fake_storage.js';

const ALLOWED_FIELDS = ['completedAt', 'difficulty', 'hintsUsed', 'name', 'seconds'];

function makeScore(overrides = {}) {
  return {
    name: 'Ada',
    seconds: 120,
    difficulty: 'medium',
    hintsUsed: 0,
    completedAt: 1_700_000_000_000,
    ...overrides,
  };
}

/** Ten scores at 100, 110, ... 190 seconds. */
function makeTopTen() {
  return Array.from({ length: MAX_SCORES }, (_, index) =>
    makeScore({ name: `P${index}`, seconds: 100 + index * 10, completedAt: 1000 + index })
  );
}

function stored(scores, version = SCHEMA_VERSION) {
  return JSON.stringify({ version, scores });
}

test('scoreboard key and schema are versioned', () => {
  assert.equal(SCOREBOARD_KEY, 'sudoku.scoreboard.v1');
  assert.equal(SCHEMA_VERSION, 1);
  assert.equal(MAX_SCORES, 10);
});

test('recordable seconds are whole numbers from 0 through 86,399', () => {
  for (const value of [0, 1, 86399]) {
    assert.equal(isRecordableSeconds(value), true);
  }
  for (const value of [-1, 86400, 1.5, Number.NaN, '10', true, null]) {
    assert.equal(isRecordableSeconds(value), false);
  }
});

test('sanitizeScore accepts a valid score and trims the name', () => {
  assert.deepEqual(sanitizeScore(makeScore({ name: '  Ada ' })), makeScore());
  assert.deepEqual(sanitizeScore(makeScore({ seconds: 86399, hintsUsed: 81 })).seconds, 86399);
});

test('sanitizeScore rejects each invalid field on its own', () => {
  const invalid = {
    name: [undefined, '', '   ', 'x'.repeat(31), 42, 'A\u0000'],
    seconds: [undefined, -1, 86400, 1.5, '120', true, null],
    difficulty: [undefined, 'custom', 'Easy', '', 1, true],
    hintsUsed: [undefined, -1, 82, 0.5, '0', true, null],
    completedAt: [undefined, 0, -5, 1.5, '1700000000000', true, Number.MAX_SAFE_INTEGER + 2],
  };
  for (const [field, values] of Object.entries(invalid)) {
    for (const value of values) {
      const score = makeScore();
      if (value === undefined) {
        delete score[field];
      } else {
        score[field] = value;
      }
      assert.equal(sanitizeScore(score), null, `${field}=${String(value)} should be rejected`);
    }
  }
  for (const value of [null, undefined, 'score', 5, [makeScore()]]) {
    assert.equal(sanitizeScore(value), null);
  }
});

test('sanitizeScore keeps only the allowed fields', () => {
  const parsed = JSON.parse(
    '{"name":"Ada","seconds":5,"difficulty":"easy","hintsUsed":1,"completedAt":9,' +
      '"token":"secret","puzzle":[[1]],"__proto__":{"polluted":true}}'
  );
  const clean = sanitizeScore(parsed);
  assert.deepEqual(Object.keys(clean).sort(), ALLOWED_FIELDS);
  assert.equal(Object.getPrototypeOf(clean), Object.prototype);
  assert.equal(clean.polluted, undefined);
});

test('sanitizeScore ignores inherited fields', () => {
  const inherited = Object.create(makeScore());
  assert.equal(sanitizeScore(inherited), null);
});

test('scores sort by seconds, hints, completion time, then name', () => {
  const expected = [
    makeScore({ name: 'fastest', seconds: 50, hintsUsed: 9, completedAt: 900 }),
    makeScore({ name: 'fewer-hints', seconds: 60, hintsUsed: 0, completedAt: 900 }),
    makeScore({ name: 'earlier', seconds: 60, hintsUsed: 1, completedAt: 100 }),
    makeScore({ name: 'Bob', seconds: 60, hintsUsed: 1, completedAt: 200 }),
    makeScore({ name: 'alice', seconds: 60, hintsUsed: 1, completedAt: 200 }),
  ];
  const orders = [expected.slice().reverse(), [expected[3], expected[0], expected[4], expected[2], expected[1]]];
  for (const input of orders) {
    const snapshot = input.slice();
    assert.deepEqual(rankScores(input), expected);
    assert.deepEqual(input, snapshot, 'rankScores must not change its input');
  }
  assert.equal(compareScores(expected[3], expected[4]) < 0, true, 'uppercase sorts before lowercase by code unit');
  assert.equal(compareScores(expected[0], expected[0]), 0);
});

test('rankScores keeps only the ten fastest scores', () => {
  const many = [...makeTopTen(), makeScore({ name: 'slow', seconds: 999 }), makeScore({ name: 'quick', seconds: 1 })];
  const ranked = rankScores(many);
  assert.equal(ranked.length, MAX_SCORES);
  assert.equal(ranked[0].name, 'quick');
  assert.equal(ranked.some((score) => score.name === 'slow'), false);
});

test('insertScore returns the new rank', () => {
  const { scores, rank } = insertScore(makeTopTen(), makeScore({ name: 'new', seconds: 115, completedAt: 5000 }));
  assert.equal(rank, 3);
  assert.equal(scores.length, MAX_SCORES);
  assert.equal(scores[2].name, 'new');
  assert.equal(scores.some((score) => score.name === 'P9'), false, 'the slowest score is pushed out');
});

test('insertScore gives a slower eleventh score no rank and keeps the list', () => {
  const topTen = makeTopTen();
  const { scores, rank } = insertScore(topTen, makeScore({ name: 'slow', seconds: 500 }));
  assert.equal(rank, null);
  assert.deepEqual(scores, topTen);
});

test('insertScore ranks into an empty board and rejects invalid scores', () => {
  assert.deepEqual(insertScore([], makeScore()), { scores: [makeScore()], rank: 1 });
  assert.throws(() => insertScore([], makeScore({ difficulty: 'custom' })), TypeError);
});

test('parseStoredScores returns an empty board for unusable data', () => {
  const unusable = [
    null,
    undefined,
    42,
    '',
    'not json',
    '{"version":1,"scores":[',
    'x'.repeat(MAX_STORED_LENGTH + 1),
    stored([makeScore()]).padEnd(MAX_STORED_LENGTH + 1, ' '),
    'null',
    '[]',
    '"text"',
    stored([makeScore()], 2),
    stored([makeScore()], '1'),
    JSON.stringify({ scores: [makeScore()] }),
    JSON.stringify({ version: 1, scores: {} }),
    JSON.stringify({ version: 1 }),
  ];
  for (const raw of unusable) {
    assert.deepEqual(parseStoredScores(raw), [], `expected empty board for ${String(raw).slice(0, 40)}`);
  }
});

test('parseStoredScores drops invalid entries and sorts the rest', () => {
  const raw = stored([
    makeScore({ name: 'slow', seconds: 300 }),
    makeScore({ seconds: -1 }),
    null,
    'Ada',
    makeScore({ difficulty: 'custom' }),
    makeScore({ name: ' fast ', seconds: 30, extra: 'ignored' }),
  ]);
  assert.deepEqual(parseStoredScores(raw), [
    makeScore({ name: 'fast', seconds: 30 }),
    makeScore({ name: 'slow', seconds: 300 }),
  ]);
});

test('parseStoredScores keeps only ten of more than ten valid scores', () => {
  const raw = stored([...makeTopTen(), makeScore({ name: 'quick', seconds: 1 })]);
  const scores = parseStoredScores(raw);
  assert.equal(scores.length, MAX_SCORES);
  assert.equal(scores[0].name, 'quick');
});

test('saving then loading returns the same scores', () => {
  const storage = createFakeStorage();
  const scores = makeTopTen();
  assert.equal(saveScores(storage, scores), true);
  assert.deepEqual(loadScores(storage), { scores, available: true });
});

test('load and save report unavailable storage', () => {
  assert.deepEqual(loadScores(createFakeStorage({}, { failGet: true })), { scores: [], available: false });
  assert.deepEqual(loadScores(null), { scores: [], available: false });
  assert.equal(saveScores(createFakeStorage({}, { failSet: true }), [makeScore()]), false);
});

test('loading invalid data never rewrites storage', () => {
  const storage = createFakeStorage({ [SCOREBOARD_KEY]: 'not json' });
  assert.deepEqual(loadScores(storage), { scores: [], available: true });
  assert.equal(storage.items.get(SCOREBOARD_KEY), 'not json');
});

test('recordScore merges with a score another tab already saved', () => {
  const storage = createFakeStorage();
  recordScore(storage, makeScore({ name: 'Tab A', seconds: 90 }));
  const result = recordScore(storage, makeScore({ name: 'Tab B', seconds: 60 }));
  assert.equal(result.status, 'saved');
  assert.equal(result.rank, 1);
  assert.deepEqual(loadScores(storage).scores.map((score) => score.name), ['Tab B', 'Tab A']);
});

test('recordScore replaces corrupt or old-version data on save', () => {
  const storage = createFakeStorage({ [SCOREBOARD_KEY]: stored([makeScore()], 0) });
  assert.equal(recordScore(storage, makeScore({ name: 'New' })).status, 'saved');
  assert.deepEqual(JSON.parse(storage.items.get(SCOREBOARD_KEY)), { version: 1, scores: [makeScore({ name: 'New' })] });
});

test('recordScore does not write a score that misses the Top 10', () => {
  const storage = createFakeStorage({ [SCOREBOARD_KEY]: stored(makeTopTen()) });
  const before = storage.items.get(SCOREBOARD_KEY);
  const result = recordScore(storage, makeScore({ seconds: 500 }));
  assert.equal(result.status, 'not-ranked');
  assert.equal(result.rank, null);
  assert.equal(storage.items.get(SCOREBOARD_KEY), before);
});

test('recordScore reports invalid scores and unavailable storage', () => {
  assert.equal(recordScore(createFakeStorage(), makeScore({ seconds: 86400 })).status, 'invalid');
  assert.equal(recordScore(createFakeStorage({}, { failGet: true }), makeScore()).status, 'unavailable');
  assert.equal(recordScore(createFakeStorage({}, { failSet: true }), makeScore()).status, 'unavailable');
  assert.equal(recordScore(null, makeScore()).status, 'unavailable');
});

test('stored JSON contains only the allowed score fields', () => {
  const storage = createFakeStorage();
  recordScore(storage, { ...makeScore(), token: 'signed-token', puzzle: [[0]], board: [[1]], solution: [[1]] });
  const raw = storage.items.get(SCOREBOARD_KEY);
  const data = JSON.parse(raw);
  assert.deepEqual(Object.keys(data).sort(), ['scores', 'version']);
  assert.deepEqual(Object.keys(data.scores[0]).sort(), ALLOWED_FIELDS);
  for (const forbidden of ['token', 'puzzle', 'board', 'solution']) {
    assert.equal(raw.includes(forbidden), false);
  }
  assert.equal(serializeScores([makeScore({ token: 'x' })]).includes('token'), false);
});

test('formatCompletionMessage covers each outcome', () => {
  const base = 'Congratulations! You solved the puzzle in 03:25 with';
  assert.equal(
    formatCompletionMessage({ seconds: 205, hintsUsed: 1, status: 'saved', rank: 2 }),
    `${base} 1 hint. Your time ranks #2 in the Top 10.`
  );
  assert.equal(
    formatCompletionMessage({ seconds: 205, hintsUsed: 2, status: 'not-ranked', rank: null }),
    `${base} 2 hints. Your time did not make the Top 10.`
  );
  assert.equal(
    formatCompletionMessage({ seconds: 205, hintsUsed: 0, status: 'unavailable', rank: null }),
    `${base} 0 hints. Your score could not be saved because browser storage is unavailable.`
  );
  assert.equal(
    formatCompletionMessage({ seconds: 86405, hintsUsed: 0, status: 'too-long', rank: null }),
    "Congratulations! You solved the puzzle in 1440:05 with 0 hints. Games longer than 24 hours aren't recorded."
  );
});

test('formatDifficulty capitalizes the difficulty', () => {
  assert.equal(formatDifficulty('easy'), 'Easy');
  assert.equal(formatDifficulty('hard'), 'Hard');
});
