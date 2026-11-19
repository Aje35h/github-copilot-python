// Pure timer helpers. Callers pass the clock value in milliseconds, so the
// browser can use performance.now() and tests can use fixed numbers.

function assertTime(value, name) {
  if (!Number.isFinite(value)) {
    throw new TypeError(`${name} must be a finite number of milliseconds.`);
  }
}

function assertWholeSeconds(seconds) {
  if (!Number.isSafeInteger(seconds) || seconds < 0) {
    throw new RangeError('seconds must be a non-negative whole number.');
  }
}

/** Return a running timer that started at startMs. */
export function createTimer(startMs) {
  assertTime(startMs, 'startMs');
  return Object.freeze({ startMs, stopMs: null });
}

export function isTimerRunning(timer) {
  return timer.stopMs === null;
}

/** Return a stopped copy of the timer; stopping again keeps the first stop time. */
export function stopTimer(timer, nowMs) {
  if (!isTimerRunning(timer)) {
    return timer;
  }
  assertTime(nowMs, 'nowMs');
  return Object.freeze({ startMs: timer.startMs, stopMs: nowMs });
}

/** Return whole elapsed seconds, rounded down and never negative. */
export function getElapsedSeconds(timer, nowMs) {
  const endMs = isTimerRunning(timer) ? nowMs : timer.stopMs;
  assertTime(endMs, 'nowMs');
  return Math.max(0, Math.floor((endMs - timer.startMs) / 1000));
}

/** Format seconds as MM:SS. Minutes keep counting past 59 instead of using hours. */
export function formatElapsed(seconds) {
  assertWholeSeconds(seconds);
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
}

/** Format seconds as an ISO 8601 duration for the <time datetime> attribute. */
export function toIsoDuration(seconds) {
  assertWholeSeconds(seconds);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  let duration = 'PT';
  if (hours > 0) {
    duration += `${hours}H`;
  }
  if (minutes > 0) {
    duration += `${minutes}M`;
  }
  if (remainder > 0 || duration === 'PT') {
    duration += `${remainder}S`;
  }
  return duration;
}
