from __future__ import annotations

import copy
import random

SIZE = 9
EMPTY = 0
# Lowest clue count that greedy unique-preserving removal reliably reaches:
# in 200 seeded grids, 83.5% reached 25 clues on the first grid, so the
# retry budget makes failure negligible. Valid puzzles with fewer clues
# exist, but this generator cannot produce them dependably.
MIN_CLUES = 25
MAX_CLUES = SIZE * SIZE
DEFAULT_CLUE_COUNT = 35
MAX_GENERATION_ATTEMPTS = 20
DIFFICULTY_CLUE_COUNTS = {
    "easy": 40,
    "medium": 32,
    "hard": 28,
}

Board = list[list[int]]

def deep_copy(board):
    return copy.deepcopy(board)

def create_empty_board():
    return [[EMPTY for _ in range(SIZE)] for _ in range(SIZE)]

def is_safe(board, row, col, num):
    # Check row and column
    for x in range(SIZE):
        if board[row][x] == num or board[x][col] == num:
            return False
    # Check 3x3 box
    start_row = row - row % 3
    start_col = col - col % 3
    for i in range(3):
        for j in range(3):
            if board[start_row + i][start_col + j] == num:
                return False
    return True

def fill_board(board: Board, rng: random.Random | None = None) -> bool:
    """Fill every empty cell of ``board`` in place with a valid Sudoku solution.

    Candidates are shuffled with ``rng`` when supplied, otherwise with the
    module-level ``random`` functions. Returns ``False`` if no solution exists.
    """
    shuffle = rng.shuffle if rng is not None else random.shuffle
    for row in range(SIZE):
        for col in range(SIZE):
            if board[row][col] == EMPTY:
                possible = list(range(1, SIZE + 1))
                shuffle(possible)
                for candidate in possible:
                    if is_safe(board, row, col, candidate):
                        board[row][col] = candidate
                        if fill_board(board, rng):
                            return True
                        board[row][col] = EMPTY
                return False
    return True

def remove_cells(board, clues):
    attempts = SIZE * SIZE - clues
    while attempts > 0:
        row = random.randrange(SIZE)
        col = random.randrange(SIZE)
        if board[row][col] != EMPTY:
            board[row][col] = EMPTY
            attempts -= 1

def clue_count_for_difficulty(difficulty: str) -> int:
    """Return the clue-count target for an Easy, Medium, or Hard puzzle.

    Raises ``ValueError`` for an unknown difficulty name.
    """
    clue_count = DIFFICULTY_CLUE_COUNTS.get(difficulty.strip().lower())
    if clue_count is None:
        allowed = ", ".join(DIFFICULTY_CLUE_COUNTS)
        raise ValueError(f"difficulty must be one of: {allowed}.")
    return clue_count


def validate_clue_count(clues: int) -> None:
    """Raise ``ValueError`` unless ``clues`` is a whole number from 25 to 81."""
    if isinstance(clues, bool) or not isinstance(clues, int):
        raise ValueError("clues must be a whole number.")
    if not MIN_CLUES <= clues <= MAX_CLUES:
        raise ValueError(f"clues must be between {MIN_CLUES} and {MAX_CLUES}.")


def parse_clue_count(difficulty: str | None, clues: str | None) -> int:
    """Resolve request text into a clue count.

    A difficulty takes precedence over an explicit clue count; when neither is
    supplied the legacy default of 35 clues is used. Raises ``ValueError`` for
    an unknown difficulty or an invalid clue count.
    """
    if difficulty is not None:
        return clue_count_for_difficulty(difficulty)
    if clues is None:
        return DEFAULT_CLUE_COUNT
    try:
        clue_count = int(clues)
    except ValueError:
        raise ValueError("clues must be a whole number.") from None
    validate_clue_count(clue_count)
    return clue_count


def _validate_board_shape(board: Board) -> None:
    if len(board) != SIZE or any(len(row) != SIZE for row in board):
        raise ValueError("board must be a 9x9 grid.")
    for row in board:
        for value in row:
            if isinstance(value, bool) or not isinstance(value, int):
                raise ValueError("board values must be whole numbers.")
            if not EMPTY <= value <= SIZE:
                raise ValueError("board values must be between 0 and 9.")


def _has_conflicting_clues(board: Board) -> bool:
    for row in range(SIZE):
        for col in range(SIZE):
            value = board[row][col]
            if value == EMPTY:
                continue
            board[row][col] = EMPTY
            conflict = not is_safe(board, row, col, value)
            board[row][col] = value
            if conflict:
                return True
    return False


def _find_most_constrained_cell(
    board: Board,
) -> tuple[int, int, list[int]] | None:
    """Return the empty cell with the fewest legal values, or ``None`` if full."""
    best_cell = None
    for row in range(SIZE):
        for col in range(SIZE):
            if board[row][col] != EMPTY:
                continue
            candidates = [
                value
                for value in range(1, SIZE + 1)
                if is_safe(board, row, col, value)
            ]
            if best_cell is None or len(candidates) < len(best_cell[2]):
                best_cell = (row, col, candidates)
                if len(candidates) <= 1:
                    return best_cell
    return best_cell


def _count_solutions_in_place(board: Board, limit: int) -> int:
    cell = _find_most_constrained_cell(board)
    if cell is None:
        return 1
    row, col, candidates = cell
    found = 0
    for candidate in candidates:
        board[row][col] = candidate
        found += _count_solutions_in_place(board, limit - found)
        if found >= limit:
            break
    board[row][col] = EMPTY
    return found


def _solve_in_place(board: Board) -> bool:
    cell = _find_most_constrained_cell(board)
    if cell is None:
        return True
    row, col, candidates = cell
    for candidate in candidates:
        board[row][col] = candidate
        if _solve_in_place(board):
            return True
    board[row][col] = EMPTY
    return False


def count_solutions(board: Board, limit: int = 2) -> int:
    """Count solutions of ``board``, stopping as soon as ``limit`` are found.

    The input board is not modified. Boards whose existing clues conflict have
    zero solutions. Raises ``ValueError`` for a malformed board or a limit
    below one.
    """
    if limit < 1:
        raise ValueError("limit must be at least 1.")
    _validate_board_shape(board)
    working_board = deep_copy(board)
    if _has_conflicting_clues(working_board):
        return 0
    return _count_solutions_in_place(working_board, limit)


def solve_board(board: Board) -> Board | None:
    """Return a solved copy of ``board``, or ``None`` if it has no solution.

    The input board is not modified. Raises ``ValueError`` for a malformed board.
    """
    _validate_board_shape(board)
    working_board = deep_copy(board)
    if _has_conflicting_clues(working_board):
        return None
    if not _solve_in_place(working_board):
        return None
    return working_board


def has_unique_solution(board: Board) -> bool:
    """Return ``True`` only when ``board`` has exactly one solution."""
    return count_solutions(board, limit=2) == 1


def remove_cells_preserving_uniqueness(
    board: Board, clues: int, rng: random.Random | None = None
) -> bool:
    """Blank cells of ``board`` in place while it keeps exactly one solution.

    Each filled cell is tried once in shuffled order. A removal is kept only if
    the solution count is exactly one; otherwise the value is restored.
    Returns ``True`` when exactly ``clues`` filled cells remain.
    """
    shuffle = rng.shuffle if rng is not None else random.shuffle
    positions = [
        (row, col)
        for row in range(SIZE)
        for col in range(SIZE)
        if board[row][col] != EMPTY
    ]
    shuffle(positions)
    remaining_clues = len(positions)
    for row, col in positions:
        if remaining_clues <= clues:
            break
        value = board[row][col]
        board[row][col] = EMPTY
        if has_unique_solution(board):
            remaining_clues -= 1
        else:
            board[row][col] = value
    return remaining_clues == clues


def generate_puzzle(
    clues: int = DEFAULT_CLUE_COUNT, rng: random.Random | None = None
) -> tuple[Board, Board]:
    """Generate a ``(puzzle, solution)`` pair whose puzzle has one solution.

    Pass a seeded ``random.Random`` as ``rng`` for reproducible output.
    Raises ``ValueError`` for an invalid clue count and ``RuntimeError`` if no
    uniquely solvable puzzle with that clue count is found within
    ``MAX_GENERATION_ATTEMPTS`` complete grids.
    """
    validate_clue_count(clues)
    for _ in range(MAX_GENERATION_ATTEMPTS):
        board = create_empty_board()
        fill_board(board, rng)
        solution = deep_copy(board)
        if remove_cells_preserving_uniqueness(board, clues, rng):
            return deep_copy(board), solution
    raise RuntimeError(
        f"Could not generate a uniquely solvable puzzle with {clues} clues."
    )
