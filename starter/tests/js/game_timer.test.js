import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  createTimer,
  formatElapsed,
  getElapsedSeconds,
  isTimerRunning,
  stopTimer,
  toIsoDuration,
} from '../../static/game_timer.js';

test('elapsed time is rounded down to whole seconds', () => {
  const timer = createTimer(1000);
  assert.equal(getElapsedSeconds(timer, 1999), 0);
  assert.equal(getElapsedSeconds(timer, 2000), 1);
  assert.equal(getElapsedSeconds(timer, 62999), 61);
});

test('a clock that goes backwards gives zero seconds', () => {
  assert.equal(getElapsedSeconds(createTimer(5000), 1000), 0);
});

test('stopping freezes the time and stopping again changes nothing', () => {
  const running = createTimer(0);
  const stopped = stopTimer(running, 3500);
  assert.equal(isTimerRunning(running), true);
  assert.equal(isTimerRunning(stopped), false);
  assert.equal(getElapsedSeconds(stopped, 999999), 3);
  assert.equal(stopTimer(stopped, 9000), stopped);
  assert.equal(getElapsedSeconds(running, 1000), 1, 'the original timer is not changed');
});

test('formatElapsed uses MM:SS and keeps counting minutes past an hour', () => {
  const cases = [
    [0, '00:00'],
    [59, '00:59'],
    [60, '01:00'],
    [3599, '59:59'],
    [3600, '60:00'],
    [6000, '100:00'],
    [86399, '1439:59'],
  ];
  for (const [seconds, expected] of cases) {
    assert.equal(formatElapsed(seconds), expected);
  }
});

test('invalid inputs throw', () => {
  for (const value of [-1, 1.5, Number.NaN, Infinity, '5', null]) {
    assert.throws(() => formatElapsed(value), RangeError);
    assert.throws(() => toIsoDuration(value), RangeError);
  }
  assert.throws(() => createTimer(Number.NaN), TypeError);
  assert.throws(() => getElapsedSeconds(createTimer(0), undefined), TypeError);
});

test('toIsoDuration produces ISO 8601 durations', () => {
  assert.equal(toIsoDuration(0), 'PT0S');
  assert.equal(toIsoDuration(45), 'PT45S');
  assert.equal(toIsoDuration(205), 'PT3M25S');
  assert.equal(toIsoDuration(3600), 'PT1H');
  assert.equal(toIsoDuration(86399), 'PT23H59M59S');
});
