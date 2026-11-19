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
};

let elements = null;
let cellInputs = [];

function selectElements() {
  return {
    board: document.getElementById('sudoku-board'),
    difficulty: document.getElementById('difficulty'),
    newGame: document.getElementById('new-game'),
    check: document.getElementById('check-solution'),
    hint: document.getElementById('hint'),
    message: document.getElementById('message'),
  };
}

function setStatus(text, tone = 'info') {
  elements.message.textContent = text;
  elements.message.dataset.tone = tone;
}

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
  const locked = kind !== 'editable';

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
  if (state.lockedCells.has(key)) {
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
  buildBoard();
  renderAllCells();
}

async function newGame() {
  const selected = elements.difficulty.value;
  const difficulty = isAllowedDifficulty(selected) ? selected : DEFAULT_DIFFICULTY;
  setStatus(`Loading a new ${difficulty} puzzle.`);
  const result = await requestJson(`/new?difficulty=${encodeURIComponent(difficulty)}`);
  if (!result.ok || !isValidNewGameResponse(result.data)) {
    setStatus(errorMessage(result, 'Could not start a new game. Please try again.'), 'error');
    return;
  }
  startGame(result.data);
  setStatus(`New ${state.difficulty} puzzle ready. ${countEmptyCells(state.board)} cells to fill.`);
}

function hasGame() {
  if (state.token) {
    return true;
  }
  setStatus('Start a new game first.', 'error');
  return false;
}

async function performCheck() {
  if (!hasGame()) {
    return;
  }
  const submitted = copyBoard(state.board);
  const result = await postGame('/check', submitted);
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
  const message = formatCheckMessage({
    incorrectCount: state.incorrectCells.size,
    complete,
    emptyCount: countEmptyCells(state.board),
  });
  const tone = complete ? 'success' : state.incorrectCells.size > 0 ? 'error' : 'info';
  setStatus(message, tone);
}

async function performHint() {
  if (!hasGame()) {
    return;
  }
  const result = await postGame('/hint', copyBoard(state.board));
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
  refreshConflicts();
  setStatus(`Hint: row ${row + 1}, column ${col + 1} is ${value}. Hints used: ${state.hintsUsed}.`);
  if (isReadyToAutoCheck()) {
    await performCheck();
  }
}

function init() {
  elements = selectElements();
  elements.newGame.addEventListener('click', () => runExclusive(newGame));
  elements.check.addEventListener('click', () => runExclusive(performCheck));
  elements.hint.addEventListener('click', () => runExclusive(performHint));
  runExclusive(newGame);
}

// Module scripts run after the document is parsed.
init();