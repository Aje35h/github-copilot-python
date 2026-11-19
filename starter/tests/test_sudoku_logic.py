from itertools import count

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
