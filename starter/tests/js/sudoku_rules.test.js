import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_DIFFICULTY,
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
  isValidBoard,
  isValidCheckResponse,
  isValidHintResponse,
  isValidNewGameResponse,
  parseCellValue,
} from '../../static/sudoku_rules.js';

function emptyBoard() {
  return Array.from({ length: 9 }, () => Array(9).fill(0));
}

function boardWith(cells) {
  const board = emptyBoard();
  for (const [row, col, value] of cells) {
    board[row][col] = value;
  }
  return board;
}

test('isAllowedDifficulty accepts only easy, medium, and hard', () => {
  assert.equal(DEFAULT_DIFFICULTY, 'medium');
  for (const value of ['easy', 'medium', 'hard']) {
    assert.equal(isAllowedDifficulty(value), true);
  }
  for (const value of ['', 'Hard', 'custom', 'expert', null, undefined, 1]) {
    assert.equal(isAllowedDifficulty(value), false);
  }
});

test('parseCellValue accepts one digit from 1 to 9', () => {
  assert.equal(parseCellValue('5'), 5);
  assert.equal(parseCellValue(' 9 '), 9);
  for (const text of ['', '0', 'a', '12', '-1', '1.5', null, 5]) {
    assert.equal(parseCellValue(text), null);
  }
});

test('isValidBoard requires a 9x9 grid of integers from 0 to 9', () => {
  assert.equal(isValidBoard(emptyBoard()), true);
  assert.equal(isValidBoard(emptyBoard().slice(0, 8)), false);
  assert.equal(isValidBoard(boardWith([[0, 0, 10]])), false);
  assert.equal(isValidBoard(boardWith([[0, 0, 1.5]])), false);
  assert.equal(isValidBoard(boardWith([[0, 0, '5']])), false);
  assert.equal(isValidBoard(null), false);
});

test('copyBoard does not share rows', () => {
  const board = emptyBoard();
  const copied = copyBoard(board);
  copied[0][0] = 4;
  assert.equal(board[0][0], 0);
});

test('getLockedCells and countEmptyCells use prefilled values', () => {
  const puzzle = boardWith([[0, 0, 5], [8, 8, 9]]);
  assert.deepEqual([...getLockedCells(puzzle)].sort((a, b) => a - b), [0, 80]);
  assert.equal(countEmptyCells(puzzle), 79);
});

test('findConflicts marks duplicate values in rows, columns, and boxes', () => {
  assert.deepEqual(
    findConflicts(boardWith([[0, 0, 5], [0, 8, 5]])),
    new Set([cellKey(0, 0), cellKey(0, 8)])
  );
  assert.deepEqual(
    findConflicts(boardWith([[0, 4, 7], [8, 4, 7]])),
    new Set([cellKey(0, 4), cellKey(8, 4)])
  );
  assert.deepEqual(
    findConflicts(boardWith([[3, 3, 2], [5, 5, 2]])),
    new Set([cellKey(3, 3), cellKey(5, 5)])
  );
});

test('findConflicts ignores empty cells and non-conflicting values', () => {
  assert.equal(findConflicts(emptyBoard()).size, 0);
  assert.equal(findConflicts(boardWith([[0, 0, 1], [1, 3, 1], [3, 1, 1]])).size, 0);
});

test('isValidNewGameResponse checks puzzle, difficulty, and token', () => {
  const valid = { puzzle: emptyBoard(), difficulty: 'hard', token: 'abc' };
  assert.equal(isValidNewGameResponse(valid), true);
  assert.equal(isValidNewGameResponse({ ...valid, token: '' }), false);
  assert.equal(isValidNewGameResponse({ ...valid, difficulty: 'expert' }), false);
  assert.equal(isValidNewGameResponse({ ...valid, puzzle: [[1]] }), false);
  assert.equal(isValidNewGameResponse(null), false);
});

test('isValidCheckResponse requires coordinates and a completion flag', () => {
  assert.equal(isValidCheckResponse({ incorrect: [[0, 8]], complete: false }), true);
  assert.equal(isValidCheckResponse({ incorrect: [], complete: true }), true);
  assert.equal(isValidCheckResponse({ incorrect: [] }), false);
  assert.equal(isValidCheckResponse({ incorrect: [[0, 9]], complete: false }), false);
  assert.equal(isValidCheckResponse({ incorrect: [[0]], complete: false }), false);
  assert.equal(isValidCheckResponse({ incorrect: 'none', complete: true }), false);
  assert.equal(isValidCheckResponse(null), false);
});

test('isValidHintResponse rejects malformed or locked hints', () => {
  const locked = new Set([cellKey(0, 0)]);
  assert.equal(isValidHintResponse({ row: 0, col: 1, value: 4 }, locked), true);
  assert.equal(isValidHintResponse({ row: 0, col: 0, value: 4 }, locked), false);
  assert.equal(isValidHintResponse({ row: 9, col: 1, value: 4 }, locked), false);
  assert.equal(isValidHintResponse({ row: 0, col: 1, value: 0 }, locked), false);
  assert.equal(isValidHintResponse({ row: 0, col: 1, value: '4' }, locked), false);
  assert.equal(isValidHintResponse(null, locked), false);
});

test('applyHint fills and locks the cell without mutating inputs', () => {
  const board = emptyBoard();
  const locked = new Set();

  const next = applyHint(board, locked, { row: 2, col: 3, value: 6 });

  assert.equal(next.board[2][3], 6);
  assert.equal(next.lockedCells.has(cellKey(2, 3)), true);
  assert.equal(board[2][3], 0);
  assert.equal(locked.size, 0);
});

test('describeCell names position, kind, and problems in text', () => {
  assert.equal(describeCell(0, 1), 'Row 1, column 2');
  assert.equal(describeCell(2, 3, { kind: 'given' }), 'Row 3, column 4, given');
  assert.equal(
    describeCell(8, 8, { kind: 'hint', conflict: true, incorrect: true }),
    'Row 9, column 9, hint, conflicts with another value, incorrect'
  );
});

test('status messages describe outcomes without relying on color', () => {
  assert.equal(formatConflictMessage(0), '');
  assert.equal(
    formatConflictMessage(2),
    '2 cells conflict with another value in the same row, column, or box.'
  );
  assert.equal(
    formatCheckMessage({ incorrectCount: 0, complete: true, emptyCount: 0 }),
    'Congratulations! You solved the puzzle.'
  );
  assert.equal(
    formatCheckMessage({ incorrectCount: 1, complete: false, emptyCount: 3 }),
    '1 incorrect value marked. 3 cells still empty.'
  );
  assert.equal(
    formatCheckMessage({ incorrectCount: 0, complete: false, emptyCount: 1 }),
    'No incorrect values so far. 1 cell still empty.'
  );
});
