from itertools import count
import random

import pytest

import sudoku_logic


SOLUTION = [
    [1, 2, 3, 4, 5, 6, 7, 8, 9],
    [4, 5, 6, 7, 8, 9, 1, 2, 3],
    [7, 8, 9, 1, 2, 3, 4, 5, 6],
    [2, 3, 4, 5, 6, 7, 8, 9, 1],
    [5, 6, 7, 8, 9, 1, 2, 3, 4],
    [8, 9, 1, 2, 3, 4, 5, 6, 7],
    [3, 4, 5, 6, 7, 8, 9, 1, 2],
    [6, 7, 8, 9, 1, 2, 3, 4, 5],
    [9, 1, 2, 3, 4, 5, 6, 7, 8],
]


def test_create_empty_board_has_independent_nine_by_nine_rows():
    board = sudoku_logic.create_empty_board()

    assert len(board) == sudoku_logic.SIZE
    assert all(len(row) == sudoku_logic.SIZE for row in board)
    assert all(value == sudoku_logic.EMPTY for row in board for value in row)

    board[0][0] = 1
    assert board[1][0] == sudoku_logic.EMPTY


def test_deep_copy_does_not_share_nested_rows():
    board = sudoku_logic.create_empty_board()

    copied_board = sudoku_logic.deep_copy(board)
    copied_board[0][0] = 1

    assert board[0][0] == sudoku_logic.EMPTY


def test_is_safe_checks_row_column_and_box_conflicts():
    board = sudoku_logic.create_empty_board()
    board[0][0] = 5

    assert not sudoku_logic.is_safe(board, 0, 1, 5)
    assert not sudoku_logic.is_safe(board, 1, 0, 5)
    assert not sudoku_logic.is_safe(board, 1, 1, 5)
    assert sudoku_logic.is_safe(board, 1, 1, 6)


def test_fill_board_completes_a_board_with_one_empty_cell(monkeypatch):
    monkeypatch.setattr(sudoku_logic.random, "shuffle", lambda values: None)
    board = [row[:] for row in SOLUTION]
    board[8][8] = sudoku_logic.EMPTY

    assert sudoku_logic.fill_board(board)
    assert board == SOLUTION


def test_generate_puzzle_returns_solution_and_requested_clue_count(monkeypatch):
    call_index = count()

    def next_board_coordinate(_size):
        index = next(call_index)
        cell_index = (index // 2) % (sudoku_logic.SIZE * sudoku_logic.SIZE)
        if index % 2 == 0:
            return cell_index // sudoku_logic.SIZE
        return cell_index % sudoku_logic.SIZE

    monkeypatch.setattr(sudoku_logic.random, "shuffle", lambda values: None)
    monkeypatch.setattr(sudoku_logic.random, "randrange", next_board_coordinate)

    puzzle, solution = sudoku_logic.generate_puzzle(clues=35)

    expected_values = list(range(1, sudoku_logic.SIZE + 1))
    assert all(sorted(row) == expected_values for row in solution)
    assert all(
        sorted(solution[row][column] for row in range(sudoku_logic.SIZE))
        == expected_values
        for column in range(sudoku_logic.SIZE)
    )
    assert sum(value != sudoku_logic.EMPTY for row in puzzle for value in row) == 35
    assert all(
        puzzle[row][column] in (sudoku_logic.EMPTY, solution[row][column])
        for row in range(sudoku_logic.SIZE)
        for column in range(sudoku_logic.SIZE)
    )


def _board_from_rows(rows):
    return [[int(character) for character in row] for row in rows]


UNIQUE_PUZZLE = _board_from_rows(
    [
        "530070000",
        "600195000",
        "098000060",
        "800060003",
        "400803001",
        "700020006",
        "060000280",
        "000419005",
        "000080079",
    ]
)
UNIQUE_PUZZLE_SOLUTION = _board_from_rows(
    [
        "534678912",
        "672195348",
        "198342567",
        "859761423",
        "426853791",
        "713924856",
        "961537284",
        "287419635",
        "345286179",
    ]
)


def _two_solution_board():
    board = [row[:] for row in UNIQUE_PUZZLE_SOLUTION]
    for row, column in ((0, 3), (0, 4), (3, 3), (3, 4)):
        board[row][column] = sudoku_logic.EMPTY
    return board


def _conflicting_board():
    board = sudoku_logic.create_empty_board()
    board[0][0] = 5
    board[0][8] = 5
    return board


def _clue_count(board):
    return sum(value != sudoku_logic.EMPTY for row in board for value in row)


def _is_valid_solution(board):
    expected_values = list(range(1, sudoku_logic.SIZE + 1))
    rows = board
    columns = [list(column) for column in zip(*board)]
    boxes = [
        [
            board[box_row + row][box_column + column]
            for row in range(3)
            for column in range(3)
        ]
        for box_row in range(0, sudoku_logic.SIZE, 3)
        for box_column in range(0, sudoku_logic.SIZE, 3)
    ]
    return all(
        sorted(group) == expected_values for group in rows + columns + boxes
    )


@pytest.mark.parametrize(
    ("difficulty", "expected_clues"),
    [("easy", 40), ("medium", 32), ("hard", 28), (" HARD ", 28)],
)
def test_clue_count_for_difficulty_maps_names_to_targets(
    difficulty, expected_clues
):
    assert sudoku_logic.clue_count_for_difficulty(difficulty) == expected_clues


@pytest.mark.parametrize("difficulty", ["", "expert", "extreme"])
def test_clue_count_for_difficulty_rejects_unknown_names(difficulty):
    with pytest.raises(ValueError, match="difficulty"):
        sudoku_logic.clue_count_for_difficulty(difficulty)


@pytest.mark.parametrize(
    ("difficulty", "clues", "expected_clues"),
    [
        (None, None, 35),
        (None, "25", 25),
        (None, "81", 81),
        ("medium", None, 32),
        ("easy", "50", 40),
    ],
)
def test_parse_clue_count_resolves_request_values(
    difficulty, clues, expected_clues
):
    assert sudoku_logic.parse_clue_count(difficulty, clues) == expected_clues


@pytest.mark.parametrize("clues", ["", "abc", "35.5", "17", "24", "82", "-1"])
def test_parse_clue_count_rejects_invalid_clues(clues):
    with pytest.raises(ValueError, match="clues"):
        sudoku_logic.parse_clue_count(None, clues)


def test_solve_board_returns_solution_without_mutating_input():
    puzzle = [row[:] for row in UNIQUE_PUZZLE]

    assert sudoku_logic.solve_board(puzzle) == UNIQUE_PUZZLE_SOLUTION
    assert puzzle == UNIQUE_PUZZLE


def test_solve_board_returns_none_for_conflicting_clues():
    assert sudoku_logic.solve_board(_conflicting_board()) is None


@pytest.mark.parametrize(
    ("board_factory", "expected_count"),
    [
        (lambda: [row[:] for row in UNIQUE_PUZZLE], 1),
        (lambda: [row[:] for row in UNIQUE_PUZZLE_SOLUTION], 1),
        (_two_solution_board, 2),
        (sudoku_logic.create_empty_board, 2),
        (_conflicting_board, 0),
    ],
)
def test_count_solutions_counts_up_to_two(board_factory, expected_count):
    board = board_factory()
    original_board = [row[:] for row in board]

    assert sudoku_logic.count_solutions(board) == expected_count
    assert board == original_board


def test_count_solutions_stops_at_requested_limit():
    empty_board = sudoku_logic.create_empty_board()

    assert sudoku_logic.count_solutions(empty_board, limit=1) == 1
    assert sudoku_logic.count_solutions(empty_board, limit=3) == 3


def test_count_solutions_rejects_malformed_board():
    with pytest.raises(ValueError):
        sudoku_logic.count_solutions([[0] * 9] * 8)
    with pytest.raises(ValueError):
        sudoku_logic.count_solutions([[10] + [0] * 8] + [[0] * 9] * 8)


def test_has_unique_solution_is_true_only_for_one_solution():
    assert sudoku_logic.has_unique_solution(UNIQUE_PUZZLE)
    assert not sudoku_logic.has_unique_solution(_two_solution_board())
    assert not sudoku_logic.has_unique_solution(_conflicting_board())


def test_remove_cells_keeps_only_unique_removals_and_reports_unreachable_target():
    board = sudoku_logic.create_empty_board()
    sudoku_logic.fill_board(board, random.Random(9))
    solution = [row[:] for row in board]

    reached = sudoku_logic.remove_cells_preserving_uniqueness(
        board, 17, random.Random(9)
    )

    assert not reached
    assert _clue_count(board) > 17
    assert sudoku_logic.count_solutions(board) == 1
    assert sudoku_logic.solve_board(board) == solution


@pytest.mark.parametrize("difficulty", ["easy", "medium", "hard"])
@pytest.mark.parametrize("seed", [1, 2, 3])
def test_generate_puzzle_has_target_clues_and_exactly_one_solution(
    difficulty, seed
):
    clues = sudoku_logic.clue_count_for_difficulty(difficulty)

    puzzle, solution = sudoku_logic.generate_puzzle(
        clues, rng=random.Random(seed)
    )

    assert _clue_count(puzzle) == clues
    assert _is_valid_solution(solution)
    assert all(
        puzzle[row][column] in (sudoku_logic.EMPTY, solution[row][column])
        for row in range(sudoku_logic.SIZE)
        for column in range(sudoku_logic.SIZE)
    )
    assert sudoku_logic.count_solutions(puzzle) == 1
    assert sudoku_logic.solve_board(puzzle) == solution


def test_generate_puzzle_is_reproducible_with_same_seed():
    first = sudoku_logic.generate_puzzle(32, rng=random.Random(42))
    second = sudoku_logic.generate_puzzle(32, rng=random.Random(42))

    assert first == second


def test_generate_puzzle_reaches_minimum_accepted_clue_count():
    puzzle, solution = sudoku_logic.generate_puzzle(
        sudoku_logic.MIN_CLUES, rng=random.Random(1)
    )

    assert _clue_count(puzzle) == sudoku_logic.MIN_CLUES
    assert sudoku_logic.count_solutions(puzzle) == 1
    assert sudoku_logic.solve_board(puzzle) == solution


@pytest.mark.parametrize("clues", [17, 24, 82, -1, True, "35"])
def test_generate_puzzle_rejects_invalid_clue_counts(clues):
    with pytest.raises(ValueError, match="clues"):
        sudoku_logic.generate_puzzle(clues)


def test_generate_puzzle_raises_after_bounded_failed_attempts(monkeypatch):
    attempts = []

    def never_reaches_target(board, clues, rng=None):
        attempts.append(clues)
        return False

    monkeypatch.setattr(
        sudoku_logic, "remove_cells_preserving_uniqueness", never_reaches_target
    )

    with pytest.raises(RuntimeError):
        sudoku_logic.generate_puzzle(28, rng=random.Random(1))
    assert len(attempts) == sudoku_logic.MAX_GENERATION_ATTEMPTS
