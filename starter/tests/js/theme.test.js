import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_THEME,
  THEME_KEY,
  isTheme,
  loadTheme,
  nextTheme,
  resolveTheme,
  saveTheme,
} from '../../static/theme.js';
import { createFakeStorage } from './fake_storage.js';

const INVALID_VALUES = ['Dark', 'LIGHT', ' dark', 'dark ', '"dark"', 'blue', '', null, undefined, 1, true, {}];

test('theme key is versioned and light is the default', () => {
  assert.equal(THEME_KEY, 'sudoku.theme.v1');
  assert.equal(DEFAULT_THEME, 'light');
});

test('isTheme accepts only exactly "light" or "dark"', () => {
  assert.equal(isTheme('light'), true);
  assert.equal(isTheme('dark'), true);
  for (const value of INVALID_VALUES) {
    assert.equal(isTheme(value), false, `expected ${JSON.stringify(value)} to be rejected`);
  }
});

test('loadTheme returns a valid stored theme', () => {
  assert.equal(loadTheme(createFakeStorage({ [THEME_KEY]: 'dark' })), 'dark');
  assert.equal(loadTheme(createFakeStorage({ [THEME_KEY]: 'light' })), 'light');
});

test('loadTheme ignores missing, invalid, or unreadable values without writing', () => {
  assert.equal(loadTheme(createFakeStorage()), null);
  for (const value of ['Dark', ' dark', '"dark"', 'blue', '']) {
    const storage = createFakeStorage({ [THEME_KEY]: value });
    assert.equal(loadTheme(storage), null);
    assert.equal(storage.items.get(THEME_KEY), value, 'invalid value is left in place');
  }
  assert.equal(loadTheme(createFakeStorage({}, { failGet: true })), null);
  assert.equal(loadTheme(null), null);
});

test('saveTheme stores only valid themes', () => {
  const storage = createFakeStorage();
  assert.equal(saveTheme(storage, 'dark'), true);
  assert.equal(storage.items.get(THEME_KEY), 'dark');
  for (const value of INVALID_VALUES) {
    assert.equal(saveTheme(storage, value), false);
  }
  assert.equal(storage.items.get(THEME_KEY), 'dark');
});

test('saveTheme reports unavailable storage', () => {
  assert.equal(saveTheme(createFakeStorage({}, { failSet: true }), 'dark'), false);
  assert.equal(saveTheme(null, 'dark'), false);
});

test('saved theme survives a reload', () => {
  const storage = createFakeStorage();
  saveTheme(storage, 'dark');
  assert.equal(resolveTheme(loadTheme(storage)), 'dark');
  saveTheme(storage, 'light');
  assert.equal(resolveTheme(loadTheme(storage)), 'light');
});

test('resolveTheme falls back to light and nextTheme toggles', () => {
  assert.equal(resolveTheme('dark'), 'dark');
  assert.equal(resolveTheme(null), 'light');
  assert.equal(resolveTheme('Dark'), 'light');
  assert.equal(nextTheme('light'), 'dark');
  assert.equal(nextTheme('dark'), 'light');
  assert.equal(nextTheme('blue'), 'light');
});
