import copy

import pytest

import app as sudoku_app


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
PUZZLE = copy.deepcopy(SOLUTION)
PUZZLE[0][0] = 0
PUZZLE[8][8] = 0


@pytest.fixture
def client():
    sudoku_app.CURRENT.update({"puzzle": None, "solution": None})
    sudoku_app.app.config.update(TESTING=True)

    with sudoku_app.app.test_client() as test_client:
        yield test_client

    sudoku_app.CURRENT.update({"puzzle": None, "solution": None})


def _use_deterministic_game(monkeypatch):
    monkeypatch.setattr(
        sudoku_app.sudoku_logic,
        "generate_puzzle",
        lambda clues: (copy.deepcopy(PUZZLE), copy.deepcopy(SOLUTION)),
    )


def test_index_renders_game_page(client):
    response = client.get("/")

    assert response.status_code == 200
    assert b"<title>Sudoku Game</title>" in response.data
    assert b'id="sudoku-board"' in response.data


@pytest.mark.parametrize(
    ("query_string", "expected_clues"),
    [("", 35), ("?clues=42", 42)],
)
def test_new_game_returns_puzzle_and_stores_game(
    client, monkeypatch, query_string, expected_clues
):
    received_clues = []

    def generate_puzzle(clues):
        received_clues.append(clues)
        return copy.deepcopy(PUZZLE), copy.deepcopy(SOLUTION)

    monkeypatch.setattr(
        sudoku_app.sudoku_logic, "generate_puzzle", generate_puzzle
    )

    response = client.get(f"/new{query_string}")

    assert response.status_code == 200
    assert response.get_json() == {"puzzle": PUZZLE}
    assert received_clues == [expected_clues]
    assert sudoku_app.CURRENT == {"puzzle": PUZZLE, "solution": SOLUTION}


def test_check_without_game_returns_client_error(client):
    response = client.post("/check", json={"board": SOLUTION})

    assert response.status_code == 400
    assert response.get_json() == {"error": "No game in progress"}


def test_check_returns_no_incorrect_cells_for_solution(client, monkeypatch):
    _use_deterministic_game(monkeypatch)
    client.get("/new")

    response = client.post("/check", json={"board": SOLUTION})

    assert response.status_code == 200
    assert response.get_json() == {"incorrect": []}


def test_check_returns_coordinates_of_incorrect_cells(client, monkeypatch):
    _use_deterministic_game(monkeypatch)
    client.get("/new")
    board = copy.deepcopy(SOLUTION)
    board[1][2] = 0
    board[7][4] = 0

    response = client.post("/check", json={"board": board})

    assert response.status_code == 200
    assert response.get_json() == {"incorrect": [[1, 2], [7, 4]]}
