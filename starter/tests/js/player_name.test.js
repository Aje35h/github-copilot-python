import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  FALLBACK_NAME,
  PLAYER_NAME_KEY,
  loadPlayerName,
  normalizePlayerName,
  resolvePlayerName,
  savePlayerName,
} from '../../static/player_name.js';
import { createFakeStorage } from './fake_storage.js';

test('player name key is versioned', () => {
  assert.equal(PLAYER_NAME_KEY, 'sudoku.playerName.v1');
});

test('names are trimmed and limited to 1-30 characters', () => {
  assert.equal(normalizePlayerName('  Ada  '), 'Ada');
  assert.equal(normalizePlayerName('A'), 'A');
  assert.equal(normalizePlayerName('x'.repeat(30)), 'x'.repeat(30));
  assert.equal(normalizePlayerName('x'.repeat(31)), null);
  assert.equal(normalizePlayerName(` ${'y'.repeat(30)} `), 'y'.repeat(30));
});

test('emoji count as one character each', () => {
  assert.equal(normalizePlayerName('😀'.repeat(30)), '😀'.repeat(30));
  assert.equal(normalizePlayerName('😀'.repeat(31)), null);
});

test('blank, control-character, and non-string names are rejected', () => {
  for (const value of ['', '   ', '\t\n', 'Ada\u0000', 'A\nB', 'Bad\u007f', null, undefined, 42, ['Ada'], {}]) {
    assert.equal(normalizePlayerName(value), null, `expected ${JSON.stringify(value)} to be rejected`);
  }
});

test('invalid names fall back to Anonymous', () => {
  assert.equal(FALLBACK_NAME, 'Anonymous');
  assert.equal(resolvePlayerName('  Grace '), 'Grace');
  assert.equal(resolvePlayerName(''), 'Anonymous');
  assert.equal(resolvePlayerName('x'.repeat(31)), 'Anonymous');
  assert.equal(resolvePlayerName(undefined), 'Anonymous');
});

test('loadPlayerName returns a valid stored name', () => {
  assert.equal(loadPlayerName(createFakeStorage({ [PLAYER_NAME_KEY]: ' Ada ' })), 'Ada');
});

test('loadPlayerName ignores missing, oversized, invalid, or unreadable values', () => {
  assert.equal(loadPlayerName(createFakeStorage()), null);
  assert.equal(loadPlayerName(createFakeStorage({ [PLAYER_NAME_KEY]: 'x'.repeat(257) })), null);
  assert.equal(loadPlayerName(createFakeStorage({ [PLAYER_NAME_KEY]: 'x'.repeat(40) })), null);
  assert.equal(loadPlayerName(createFakeStorage({ [PLAYER_NAME_KEY]: 'A\u0007' })), null);
  assert.equal(loadPlayerName(createFakeStorage({}, { failGet: true })), null);
  assert.equal(loadPlayerName(null), null);
});

test('loadPlayerName never writes to storage', () => {
  const storage = createFakeStorage({ [PLAYER_NAME_KEY]: 'x'.repeat(40) });
  loadPlayerName(storage);
  assert.equal(storage.items.get(PLAYER_NAME_KEY), 'x'.repeat(40));
});

test('savePlayerName stores the trimmed name', () => {
  const storage = createFakeStorage();
  assert.equal(savePlayerName(storage, '  Ada  '), 'saved');
  assert.equal(storage.items.get(PLAYER_NAME_KEY), 'Ada');
});

test('savePlayerName removes the stored name when the field is empty', () => {
  const storage = createFakeStorage({ [PLAYER_NAME_KEY]: 'Ada' });
  assert.equal(savePlayerName(storage, '   '), 'cleared');
  assert.equal(storage.items.has(PLAYER_NAME_KEY), false);
});

test('savePlayerName does not store an invalid name', () => {
  const storage = createFakeStorage({ [PLAYER_NAME_KEY]: 'Ada' });
  assert.equal(savePlayerName(storage, 'x'.repeat(31)), 'invalid');
  assert.equal(savePlayerName(storage, 'A\u0000'), 'invalid');
  assert.equal(storage.items.get(PLAYER_NAME_KEY), 'Ada');
});

test('savePlayerName reports unavailable storage', () => {
  const storage = createFakeStorage({}, { failSet: true });
  assert.equal(savePlayerName(storage, 'Ada'), 'unavailable');
  assert.equal(savePlayerName(storage, ''), 'unavailable');
  assert.equal(savePlayerName(null, 'Ada'), 'unavailable');
});
