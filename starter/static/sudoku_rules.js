// Pure Sudoku helpers with no DOM access, shared by main.js and node --test.
export const SIZE = 9;
export const BOX_SIZE = 3;
export const EMPTY = 0;
export const DIFFICULTIES = Object.freeze(['easy', 'medium', 'hard']);
export const DEFAULT_DIFFICULTY = 'medium';

export function isAllowedDifficulty(value) {
  return typeof value === 'string' && DIFFICULTIES.includes(value);
}

/** Return 1-9 for a single digit text, otherwise null. */
export function parseCellValue(text) {
  if (typeof text !== 'string') {
    return null;
  }
  const trimmed = text.trim();
  return /^[1-9]$/.test(trimmed) ? Number(trimmed) : null;
}

export function isCellValue(value) {
  return Number.isInteger(value) && value >= EMPTY && value <= SIZE;
}

export function isValidBoard(board) {
  return (
    Array.isArray(board) &&
    board.length === SIZE &&
    board.every(
      (row) => Array.isArray(row) && row.length === SIZE && row.every(isCellValue)
    )
  );
}

export function copyBoard(board) {
  return board.map((row) => row.slice());
}

export function cellKey(row, col) {
  return row * SIZE + col;
}

export function countEmptyCells(board) {
  return board.flat().filter((value) => value === EMPTY).length;
}

/** Return the keys of all prefilled puzzle cells. */
export function getLockedCells(puzzle) {
  const locked = new Set();
  puzzle.forEach((row, rowIndex) => {
    row.forEach((value, colIndex) => {
      if (value !== EMPTY) {
        locked.add(cellKey(rowIndex, colIndex));
      }
    });
  });
  return locked;
}

function rowCells(row) {
  return Array.from({ length: SIZE }, (_, col) => [row, col]);
}

function columnCells(col) {
  return Array.from({ length: SIZE }, (_, row) => [row, col]);
}

function boxCells(box) {
  const startRow = Math.floor(box / BOX_SIZE) * BOX_SIZE;
  const startCol = (box % BOX_SIZE) * BOX_SIZE;
  return Array.from({ length: SIZE }, (_, index) => [
    startRow + Math.floor(index / BOX_SIZE),
    startCol + (index % BOX_SIZE),
  ]);
}

/**
 * Return the keys of filled cells that repeat a value in their row, column,
 * or box. Uses only Sudoku rules, never the solution.
 */
export function findConflicts(board) {
  const conflicts = new Set();
  const groups = [];
  for (let index = 0; index < SIZE; index++) {
    groups.push(rowCells(index), columnCells(index), boxCells(index));
  }
  for (const group of groups) {
    const keysByValue = new Map();
    for (const [row, col] of group) {
      const value = board[row][col];
      if (value === EMPTY) {
        continue;
      }
      const keys = keysByValue.get(value) ?? [];
      keys.push(cellKey(row, col));
      keysByValue.set(value, keys);
    }
    for (const keys of keysByValue.values()) {
      if (keys.length > 1) {
        keys.forEach((key) => conflicts.add(key));
      }
    }
  }
  return conflicts;
}

function isCoordinate(value) {
  return Number.isInteger(value) && value >= 0 && value < SIZE;
}

export function isValidNewGameResponse(data) {
  return (
    data !== null &&
    typeof data === 'object' &&
    isValidBoard(data.puzzle) &&
    isAllowedDifficulty(data.difficulty) &&
    typeof data.token === 'string' &&
    data.token.length > 0
  );
}

export function isValidCheckResponse(data) {
  return (
    data !== null &&
    typeof data === 'object' &&
    typeof data.complete === 'boolean' &&
    Array.isArray(data.incorrect) &&
    data.incorrect.every(
      (cell) =>
        Array.isArray(cell) &&
        cell.length === 2 &&
        isCoordinate(cell[0]) &&
        isCoordinate(cell[1])
    )
  );
}

/** A hint must name an in-range, unlocked cell and a digit 1-9. */
export function isValidHintResponse(data, lockedCells) {
  return (
    data !== null &&
    typeof data === 'object' &&
    isCoordinate(data.row) &&
    isCoordinate(data.col) &&
    Number.isInteger(data.value) &&
    data.value >= 1 &&
    data.value <= SIZE &&
    !lockedCells.has(cellKey(data.row, data.col))
  );
}

/** Return a new board and locked-cell set with the hint filled in and locked. */
export function applyHint(board, lockedCells, hint) {
  const nextBoard = copyBoard(board);
  nextBoard[hint.row][hint.col] = hint.value;
  const nextLocked = new Set(lockedCells);
  nextLocked.add(cellKey(hint.row, hint.col));
  return { board: nextBoard, lockedCells: nextLocked };
}

/** Build an accessible name that states position, cell kind, and problems. */
export function describeCell(row, col, { kind = 'editable', conflict = false, incorrect = false } = {}) {
  const parts = [`Row ${row + 1}, column ${col + 1}`];
  if (kind === 'given') {
    parts.push('given');
  } else if (kind === 'hint') {
    parts.push('hint');
  }
  if (conflict) {
    parts.push('conflicts with another value');
  }
  if (incorrect) {
    parts.push('incorrect');
  }
  return parts.join(', ');
}

function plural(count, word) {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

export function formatConflictMessage(conflictCount) {
  if (conflictCount === 0) {
    return '';
  }
  return `${plural(conflictCount, 'cell')} conflict with another value in the same row, column, or box.`;
}

export function formatCheckMessage({ incorrectCount, complete, emptyCount }) {
  if (complete) {
    return 'Congratulations! You solved the puzzle.';
  }
  if (incorrectCount > 0) {
    return `${plural(incorrectCount, 'incorrect value')} marked. ${plural(emptyCount, 'cell')} still empty.`;
  }
  return `No incorrect values so far. ${plural(emptyCount, 'cell')} still empty.`;
}
