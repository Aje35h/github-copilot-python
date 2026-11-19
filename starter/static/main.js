// Browser controller: DOM rendering, in-memory game state, and server requests.
// The solution never reaches the browser; /check and /hint answer from the
// signed puzzle that is kept here in memory.
import {
  DEFAULT_DIFFICULTY,
  EMPTY,
  SIZE,
  applyHint,
  cellKey,
  copyBoard,
  countEmptyCells,
  describeCell,
  findConflicts,
  formatCheckMessage,
  formatConflictMessage,
  getLockedCells,
  isAllowedDifficulty,
  isValidCheckResponse,
  isValidHintResponse,
  isValidNewGameResponse,
  parseCellValue,
} from './sudoku_rules.js';
import {
  createTimer,
  formatElapsed,
  getElapsedSeconds,
  stopTimer,
  toIsoDuration,
} from './game_timer.js';
import { loadPlayerName, resolvePlayerName, savePlayerName } from './player_name.js';
import {
  SCOREBOARD_KEY,
  formatCompletionMessage,
  formatDifficulty,
  isRecordableSeconds,
  loadScores,
  recordScore,
} from './scoreboard.js';

const TIMER_REFRESH_MS = 250;
const ALREADY_SOLVED_MESSAGE = 'This puzzle is already solved. Start a new game to play again.';

const state = {
  puzzle: null,
  board: null,
  token: null,
  difficulty: DEFAULT_DIFFICULTY,
  lockedCells: new Set(),
  hintedCells: new Set(),
  incorrectCells: new Set(),
  conflictCells: new Set(),
  hintsUsed: 0,
  busy: false,
  gameId: 0,
  completed: false,
  timer: null,
};

let elements = null;
let cellInputs = [];
let timerIntervalId = null;
let shownSeconds = null;

function selectElements() {
  return {
    board: document.getElementById('sudoku-board'),
    difficulty: document.getElementById('difficulty'),
    newGame: document.getElementById('new-game'),
    check: document.getElementById('check-solution'),
    hint: document.getElementById('hint'),
    message: document.getElementById('message'),
    playerName: document.getElementById('player-name'),
    timer: document.getElementById('timer'),
    hintsUsed: document.getElementById('hints-used'),
    scoreboardBody: document.getElementById('scoreboard-body'),
  };
}

/** Return localStorage, or null when the browser blocks access to it. */
function getStorage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function setStatus(text, tone = 'info') {
  elements.message.textContent = text;
  elements.message.dataset.tone = tone;
}

// ---- Timer and hints display ----

function renderTimer() {
  const seconds = state.timer ? getElapsedSeconds(state.timer, performance.now()) : 0;
  if (seconds === shownSeconds) {
    return;
  }
  shownSeconds = seconds;
  elements.timer.textContent = formatElapsed(seconds);
  elements.timer.dateTime = toIsoDuration(seconds);
}

function stopTimerDisplay() {
  if (timerIntervalId !== null) {
    clearInterval(timerIntervalId);
    timerIntervalId = null;
  }
}

function startTimerDisplay() {
  stopTimerDisplay();
  shownSeconds = null;
  renderTimer();
  timerIntervalId = setInterval(renderTimer, TIMER_REFRESH_MS);
}

function renderHintsUsed() {
  elements.hintsUsed.textContent = String(state.hintsUsed);
}

// ---- Scoreboard display ----

function createCell(tag, text) {
  const cell = document.createElement(tag);
  cell.textContent = text;
  return cell;
}

function createScoreRow(score, index) {
  const row = document.createElement('tr');
  const rank = createCell('th', String(index + 1));
  rank.scope = 'row';
  const time = document.createElement('time');
  time.dateTime = toIsoDuration(score.seconds);
  time.textContent = formatElapsed(score.seconds);
  const timeCell = document.createElement('td');
  timeCell.appendChild(time);
  row.append(
    rank,
    createCell('td', score.name),
    timeCell,
    createCell('td', formatDifficulty(score.difficulty)),
    createCell('td', String(score.hintsUsed))
  );
  return row;
}

function createMessageRow(text) {
  const row = document.createElement('tr');
  const cell = createCell('td', text);
  cell.colSpan = 5;
  row.appendChild(cell);
  return row;
}

function renderScoreboard({ scores, available }) {
  let rows;
  if (!available) {
    rows = [createMessageRow('Scores are unavailable because browser storage is blocked.')];
  } else if (scores.length === 0) {
    rows = [createMessageRow('No scores yet.')];
  } else {
    rows = scores.map(createScoreRow);
  }
  elements.scoreboardBody.replaceChildren(...rows);
}

function refreshScoreboard() {
  renderScoreboard(loadScores(getStorage()));
}

/** Record a score while holding a cross-tab lock when the browser supports it. */
async function recordScoreSafely(score) {
  const record = () => recordScore(getStorage(), score);
  if (navigator.locks && typeof navigator.locks.request === 'function') {
    try {
      return await navigator.locks.request(SCOREBOARD_KEY, record);
    } catch {
      // Documented fallback: record without the lock.
    }
  }
  return record();
}

// ---- Player name ----

function handlePlayerNameInput() {
  const result = savePlayerName(getStorage(), elements.playerName.value);
  if (result === 'invalid') {
    elements.playerName.setAttribute('aria-invalid', 'true');
  } else {
    elements.playerName.removeAttribute('aria-invalid');
  }
}

// ---- Board ----

function cellKind(key) {
  if (state.hintedCells.has(key)) {
    return 'hint';
  }
  return state.lockedCells.has(key) ? 'given' : 'editable';
}

function renderCell(row, col) {
  const key = cellKey(row, col);
  const input = cellInputs[key];
  const value = state.board[row][col];
  const kind = cellKind(key);
  const conflict = state.conflictCells.has(key);
  const incorrect = state.incorrectCells.has(key);
  const locked = kind !== 'editable' || state.completed;

  input.value = value === EMPTY ? '' : String(value);
  input.readOnly = locked;
  input.setAttribute('aria-readonly', String(locked));
  input.classList.toggle('prefilled', kind === 'given');
  input.classList.toggle('hinted', kind === 'hint');
  input.classList.toggle('conflict', conflict);
  input.classList.toggle('incorrect', incorrect);
  if (conflict || incorrect) {
    input.setAttribute('aria-invalid', 'true');
  } else {
    input.removeAttribute('aria-invalid');
  }
  input.setAttribute('aria-label', describeCell(row, col, { kind, conflict, incorrect }));
}

function renderAllCells() {
  for (let row = 0; row < SIZE; row++) {
    for (let col = 0; col < SIZE; col++) {
      renderCell(row, col);
    }
  }
}

function refreshConflicts() {
  state.conflictCells = findConflicts(state.board);
  renderAllCells();
}

function createCellInput(row, col) {
  const input = document.createElement('input');
  input.type = 'text';
  input.inputMode = 'numeric';
  input.maxLength = 1;
  input.autocomplete = 'off';
  input.className = 'sudoku-cell';
  input.dataset.row = String(row);
  input.dataset.col = String(col);
  // Selecting on focus and click lets a typed digit replace the current one.
  input.addEventListener('focus', () => input.select());
  input.addEventListener('click', () => input.select());
  input.addEventListener('input', () => handleCellInput(row, col));
  return input;
}

function buildBoard() {
  cellInputs = [];
  const rows = [];
  for (let row = 0; row < SIZE; row++) {
    const rowElement = document.createElement('div');
    rowElement.className = 'sudoku-row';
    for (let col = 0; col < SIZE; col++) {
      const input = createCellInput(row, col);
      cellInputs.push(input);
      rowElement.appendChild(input);
    }
    rows.push(rowElement);
  }
  elements.board.replaceChildren(...rows);
}

function isReadyToAutoCheck() {
  return countEmptyCells(state.board) === 0 && state.conflictCells.size === 0;
}

function handleCellInput(row, col) {
  const key = cellKey(row, col);
  if (state.completed || state.lockedCells.has(key)) {
    renderCell(row, col);
    return;
  }
  const text = cellInputs[key].value;
  const value = text === '' ? EMPTY : parseCellValue(text);
  if (value === null) {
    renderCell(row, col);
    setStatus('Only digits 1 to 9 are allowed.', 'error');
    return;
  }
  state.board[row][col] = value;
  state.incorrectCells.delete(key);
  refreshConflicts();

  const conflictMessage = formatConflictMessage(state.conflictCells.size);
  if (conflictMessage) {
    setStatus(conflictMessage, 'error');
  } else if (isReadyToAutoCheck()) {
    runExclusive(performCheck);
  } else {
    setStatus('');
  }
}

// ---- Server requests ----

async function requestJson(url, options) {
  let response;
  try {
    response = await fetch(url, options);
  } catch {
    return { ok: false, status: 0, data: null };
  }
  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }
  return { ok: response.ok, status: response.status, data };
}

function errorMessage(result, fallback) {
  if (result.status === 0) {
    return 'Could not reach the server. Please try again.';
  }
  if (result.data && typeof result.data.error === 'string') {
    return result.data.error;
  }
  return fallback;
}

function postGame(path, board) {
  return requestJson(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ puzzle: state.puzzle, board, token: state.token }),
  });
}

async function runExclusive(task) {
  if (state.busy) {
    return;
  }
  state.busy = true;
  elements.board.setAttribute('aria-busy', 'true');
  try {
    await task();
  } finally {
    state.busy = false;
    elements.board.removeAttribute('aria-busy');
  }
}

// ---- Game flow ----

function startGame({ puzzle, difficulty, token }) {
  state.puzzle = copyBoard(puzzle);
  state.board = copyBoard(puzzle);
  state.token = token;
  state.difficulty = difficulty;
  state.lockedCells = getLockedCells(puzzle);
  state.hintedCells = new Set();
  state.incorrectCells = new Set();
  state.conflictCells = new Set();
  state.hintsUsed = 0;
  state.gameId += 1;
  state.completed = false;
  state.timer = createTimer(performance.now());
  buildBoard();
  renderAllCells();
  renderHintsUsed();
  startTimerDisplay();
}

async function newGame() {
  const selected = elements.difficulty.value;
  const difficulty = isAllowedDifficulty(selected) ? selected : DEFAULT_DIFFICULTY;
  setStatus(`Loading a new ${difficulty} puzzle.`);
  const result = await requestJson(`/new?difficulty=${encodeURIComponent(difficulty)}`);
  if (!result.ok || !isValidNewGameResponse(result.data)) {
    // The current game and its timer keep running.
    setStatus(errorMessage(result, 'Could not start a new game. Please try again.'), 'error');
    return;
  }
  startGame(result.data);
  setStatus(`New ${state.difficulty} puzzle ready. ${countEmptyCells(state.board)} cells to fill.`);
}

function canPlay() {
  if (!state.token) {
    setStatus('Start a new game first.', 'error');
    return false;
  }
  if (state.completed) {
    setStatus(ALREADY_SOLVED_MESSAGE);
    return false;
  }
  return true;
}

/**
 * Stop the timer, lock the board, and record the score exactly once.
 * The completed flag is set before any await so repeated checks cannot
 * record the same game twice.
 */
async function finishGame(submittedAtMs) {
  if (state.completed) {
    return;
  }
  state.completed = true;
  state.timer = stopTimer(state.timer, submittedAtMs);
  stopTimerDisplay();
  renderTimer();
  renderAllCells();

  const seconds = getElapsedSeconds(state.timer, submittedAtMs);
  const hintsUsed = state.hintsUsed;
  let outcome;
  if (isRecordableSeconds(seconds)) {
    outcome = await recordScoreSafely({
      name: resolvePlayerName(elements.playerName.value),
      seconds,
      difficulty: state.difficulty,
      hintsUsed,
      completedAt: Date.now(),
    });
    if (outcome.status === 'saved' || outcome.status === 'not-ranked') {
      renderScoreboard({ scores: outcome.scores, available: true });
    }
  } else {
    outcome = { status: 'too-long', rank: null };
  }
  setStatus(formatCompletionMessage({ seconds, hintsUsed, ...outcome }), 'success');
}

async function performCheck() {
  if (!canPlay()) {
    return;
  }
  const gameId = state.gameId;
  const submitted = copyBoard(state.board);
  const submittedAtMs = performance.now();
  const result = await postGame('/check', submitted);
  if (gameId !== state.gameId) {
    return;
  }
  if (!result.ok || !isValidCheckResponse(result.data)) {
    setStatus(errorMessage(result, 'Could not check the puzzle. Please try again.'), 'error');
    return;
  }
  // Ignore results for cells the player changed while the request was pending.
  const unchanged = ([row, col]) => state.board[row][col] === submitted[row][col];
  state.incorrectCells = new Set(
    result.data.incorrect.filter(unchanged).map(([row, col]) => cellKey(row, col))
  );
  renderAllCells();

  const complete = result.data.complete && countEmptyCells(state.board) === 0
    && state.board.every((row, rowIndex) => row.every((value, col) => value === submitted[rowIndex][col]));
  if (complete) {
    await finishGame(submittedAtMs);
    return;
  }
  const message = formatCheckMessage({
    incorrectCount: state.incorrectCells.size,
    complete: false,
    emptyCount: countEmptyCells(state.board),
  });
  setStatus(message, state.incorrectCells.size > 0 ? 'error' : 'info');
}

async function performHint() {
  if (!canPlay()) {
    return;
  }
  const gameId = state.gameId;
  const result = await postGame('/hint', copyBoard(state.board));
  if (gameId !== state.gameId) {
    return;
  }
  if (!result.ok || !isValidHintResponse(result.data, state.lockedCells)) {
    setStatus(errorMessage(result, 'Could not get a hint. Please try again.'), 'error');
    return;
  }
  const { row, col, value } = result.data;
  const key = cellKey(row, col);
  const next = applyHint(state.board, state.lockedCells, { row, col, value });
  state.board = next.board;
  state.lockedCells = next.lockedCells;
  state.hintedCells.add(key);
  state.incorrectCells.delete(key);
  state.hintsUsed += 1;
  renderHintsUsed();
  refreshConflicts();
  setStatus(`Hint: row ${row + 1}, column ${col + 1} is ${value}. Hints used: ${state.hintsUsed}.`);
  if (isReadyToAutoCheck()) {
    await performCheck();
  }
}

function init() {
  elements = selectElements();
  elements.playerName.value = loadPlayerName(getStorage()) ?? '';
  elements.playerName.addEventListener('input', handlePlayerNameInput);
  elements.newGame.addEventListener('click', () => runExclusive(newGame));
  elements.check.addEventListener('click', () => runExclusive(performCheck));
  elements.hint.addEventListener('click', () => runExclusive(performHint));
  // Keep the table current when another tab records a score.
  window.addEventListener('storage', (event) => {
    if (event.key === SCOREBOARD_KEY || event.key === null) {
      refreshScoreboard();
    }
  });
  refreshScoreboard();
  runExclusive(newGame);
}

// Module scripts run after the document is parsed.
init();
