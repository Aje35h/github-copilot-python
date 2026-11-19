import copy

import pytest

import app as sudoku_app
import game_token


TEST_SECRET_KEY = "test-secret-key"


def _board_from_rows(rows):
    return [[int(character) for character in row] for row in rows]


PUZZLE = _board_from_rows(
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
SOLUTION = _board_from_rows(
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


@pytest.fixture
def client():
    sudoku_app.app.config.update(TESTING=True, SECRET_KEY=TEST_SECRET_KEY)

    with sudoku_app.app.test_client() as test_client:
        yield test_client


def _use_deterministic_game(monkeypatch):
    monkeypatch.setattr(
        sudoku_app.sudoku_logic,
        "generate_puzzle",
        lambda clues: (copy.deepcopy(PUZZLE), copy.deepcopy(SOLUTION)),
    )


def _sign(puzzle, difficulty="medium", secret_key=TEST_SECRET_KEY):
    return game_token.sign_puzzle(puzzle, difficulty, secret_key)


def _game_body(board=None, puzzle=None):
    puzzle = copy.deepcopy(PUZZLE if puzzle is None else puzzle)
    return {
        "puzzle": puzzle,
        "board": copy.deepcopy(puzzle if board is None else board),
        "token": _sign(puzzle),
    }


def test_app_has_no_shared_game_state():
    assert not hasattr(sudoku_app, "CURRENT")


def test_index_renders_game_page(client):
    response = client.get("/")

    assert response.status_code == 200
    assert b"<title>Sudoku Game</title>" in response.data
    assert b'id="sudoku-board"' in response.data


def test_index_has_accessible_game_controls(client):
    html = client.get("/").get_data(as_text=True)

    assert '<label for="difficulty">' in html
    assert '<option value="medium" selected>' in html
    for difficulty in ("easy", "medium", "hard"):
        assert f'<option value="{difficulty}"' in html
    assert 'id="check-solution"' in html
    assert 'id="hint"' in html
    assert 'id="message" role="status" aria-live="polite"' in html
    assert '<script type="module" src="/static/main.js">' in html


def test_index_has_accessible_timer_name_and_scoreboard(client):
    html = client.get("/").get_data(as_text=True)

    assert '<label for="player-name">Player name</label>' in html
    assert 'id="player-name"' in html
    assert 'maxlength="30"' in html
    assert 'aria-describedby="player-name-hint"' in html
    assert 'id="player-name-hint"' in html
    assert '<time id="timer" role="timer" datetime="PT0S">00:00</time>' in html
    assert '<span id="hints-used">0</span>' in html
    assert '<section class="scoreboard" aria-labelledby="scoreboard-heading">' in html
    assert '<h2 id="scoreboard-heading">Top 10</h2>' in html
    assert 'role="region" aria-labelledby="scoreboard-caption" tabindex="0"' in html
    assert '<caption id="scoreboard-caption">' in html
    for column in ("Rank", "Player", "Time", "Difficulty", "Hints"):
        assert f'<th scope="col">{column}</th>' in html
    assert 'id="scoreboard-body"' in html


@pytest.mark.parametrize(
    "path",
    [
        "/static/main.js",
        "/static/sudoku_rules.js",
        "/static/game_timer.js",
        "/static/player_name.js",
        "/static/scoreboard.js",
    ],
)
def test_static_modules_are_served_as_javascript(client, path):
    response = client.get(path)

    assert response.status_code == 200
    assert response.mimetype == "text/javascript"


@pytest.mark.parametrize(
    ("query_string", "expected_clues", "expected_difficulty"),
    [
        ("", 32, "medium"),
        ("?clues=42", 42, "custom"),
        ("?difficulty=easy", 40, "easy"),
        ("?difficulty=medium", 32, "medium"),
        ("?difficulty=hard", 28, "hard"),
        ("?difficulty=HARD", 28, "hard"),
        ("?difficulty=easy&clues=50", 40, "easy"),
    ],
)
def test_new_game_returns_puzzle_difficulty_and_signed_token(
    client, monkeypatch, query_string, expected_clues, expected_difficulty
):
    received_clues = []

    def generate_puzzle(clues):
        received_clues.append(clues)
        return copy.deepcopy(PUZZLE), copy.deepcopy(SOLUTION)

    monkeypatch.setattr(
        sudoku_app.sudoku_logic, "generate_puzzle", generate_puzzle
    )

    response = client.get(f"/new{query_string}")

    data = response.get_json()
    assert response.status_code == 200
    assert set(data) == {"puzzle", "difficulty", "token"}
    assert data["puzzle"] == PUZZLE
    assert data["difficulty"] == expected_difficulty
    assert received_clues == [expected_clues]
    assert game_token.load_signed_puzzle(data["token"], TEST_SECRET_KEY) == {
        "puzzle": PUZZLE,
        "difficulty": expected_difficulty,
    }


@pytest.mark.parametrize(
    "query_string",
    [
        "?difficulty=expert",
        "?difficulty=",
        "?clues=abc",
        "?clues=",
        "?clues=17",
        "?clues=24",
        "?clues=82",
    ],
)
def test_new_game_rejects_invalid_input_without_generating(
    client, monkeypatch, query_string
):
    def generate_puzzle(clues):
        raise AssertionError("generate_puzzle should not be called")

    monkeypatch.setattr(
        sudoku_app.sudoku_logic, "generate_puzzle", generate_puzzle
    )

    response = client.get(f"/new{query_string}")

    assert response.status_code == 400
    assert response.is_json
    assert set(response.get_json()) == {"error"}


def test_new_game_reports_generation_failure_as_json(client, monkeypatch):
    def generate_puzzle(clues):
        raise RuntimeError("internal detail")

    monkeypatch.setattr(
        sudoku_app.sudoku_logic, "generate_puzzle", generate_puzzle
    )

    response = client.get("/new?difficulty=hard")

    assert response.status_code == 500
    assert response.get_json() == {
        "error": "Could not generate a puzzle. Please try again."
    }


def test_new_game_token_from_real_generator_works_with_check(client):
    data = client.get("/new?difficulty=easy").get_json()

    response = client.post(
        "/check",
        json={"puzzle": data["puzzle"], "board": data["puzzle"], "token": data["token"]},
    )

    assert response.status_code == 200
    assert response.get_json() == {"incorrect": [], "complete": False}


def test_check_without_game_returns_client_error(client):
    response = client.post("/check", json={"board": SOLUTION})

    assert response.status_code == 400
    assert set(response.get_json()) == {"error"}


def test_check_returns_no_incorrect_cells_for_solution(client, monkeypatch):
    _use_deterministic_game(monkeypatch)
    game = client.get("/new").get_json()

    response = client.post(
        "/check",
        json={"puzzle": game["puzzle"], "board": SOLUTION, "token": game["token"]},
    )

    assert response.status_code == 200
    assert response.get_json() == {"incorrect": [], "complete": True}


def test_check_returns_coordinates_of_incorrect_cells(client, monkeypatch):
    _use_deterministic_game(monkeypatch)
    game = client.get("/new").get_json()
    board = copy.deepcopy(SOLUTION)
    board[0][2] = 1
    board[8][0] = 9

    response = client.post(
        "/check",
        json={"puzzle": game["puzzle"], "board": board, "token": game["token"]},
    )

    assert response.status_code == 200
    assert response.get_json() == {
        "incorrect": [[0, 2], [8, 0]],
        "complete": False,
    }


def test_check_does_not_report_empty_editable_cells(client):
    board = copy.deepcopy(PUZZLE)
    board[0][2] = SOLUTION[0][2]
    board[0][3] = 1

    response = client.post("/check", json=_game_body(board=board))

    assert response.status_code == 200
    assert response.get_json() == {"incorrect": [[0, 3]], "complete": False}


def test_hint_returns_only_first_empty_cell_and_value(client):
    response = client.post("/hint", json=_game_body())

    assert response.status_code == 200
    assert response.get_json() == {"row": 0, "col": 2, "value": SOLUTION[0][2]}


def test_hint_skips_cells_the_player_filled(client):
    board = copy.deepcopy(PUZZLE)
    board[0][2] = 9

    response = client.post("/hint", json=_game_body(board=board))

    assert response.status_code == 200
    assert response.get_json() == {"row": 0, "col": 3, "value": SOLUTION[0][3]}


def test_hint_returns_conflict_when_no_empty_cell_remains(client):
    response = client.post("/hint", json=_game_body(board=SOLUTION))

    assert response.status_code == 409
    assert set(response.get_json()) == {"error"}


def _replace(field, value):
    def mutate(body):
        body[field] = value
        return body

    return mutate


def _without(field):
    def mutate(body):
        del body[field]
        return body

    return mutate


def _set_cell(field, row, col, value):
    def mutate(body):
        body[field][row][col] = value
        return body

    return mutate


def _signed_puzzle(puzzle):
    def mutate(body):
        return {"puzzle": puzzle, "board": copy.deepcopy(puzzle), "token": _sign(puzzle)}

    return mutate


def _conflicting_puzzle():
    puzzle = copy.deepcopy(PUZZLE)
    puzzle[0][2] = 5
    return puzzle


def _two_solution_puzzle():
    puzzle = copy.deepcopy(SOLUTION)
    for row, col in ((0, 3), (0, 4), (3, 3), (3, 4)):
        puzzle[row][col] = 0
    return puzzle


def _too_few_clues_puzzle():
    puzzle = copy.deepcopy(PUZZLE)
    removed = 0
    for row in range(9):
        for col in range(9):
            if puzzle[row][col] and removed < 6:
                puzzle[row][col] = 0
                removed += 1
    return puzzle


def _other_puzzle_token(body):
    other = copy.deepcopy(PUZZLE)
    other[0][2] = SOLUTION[0][2]
    body["token"] = _sign(other)
    return body


def _changed_given_everywhere(body):
    body["puzzle"][0][0] = 1
    body["board"][0][0] = 1
    return body


TAMPERED_OR_MALFORMED_BODIES = {
    "list body": lambda body: [body],
    "missing puzzle": _without("puzzle"),
    "missing board": _without("board"),
    "missing token": _without("token"),
    "non-string token": _replace("token", 123),
    "empty token": _replace("token", ""),
    "forged token": lambda body: {**body, "token": body["token"] + "x"},
    "token signed with another key": lambda body: {
        **body,
        "token": _sign(body["puzzle"], secret_key="another-key"),
    },
    "token for another puzzle": _other_puzzle_token,
    "puzzle changed from token": _changed_given_everywhere,
    "puzzle not a list": _replace("puzzle", "530070000"),
    "puzzle with eight rows": lambda body: {**body, "puzzle": body["puzzle"][:8]},
    "board with eight rows": lambda body: {**body, "board": body["board"][:8]},
    "board with short row": lambda body: {
        **body,
        "board": [body["board"][0][:2]] + body["board"][1:],
    },
    "board value 10": _set_cell("board", 0, 2, 10),
    "board value -1": _set_cell("board", 0, 2, -1),
    "board value string": _set_cell("board", 0, 2, "4"),
    "board value true": _set_cell("board", 0, 2, True),
    "board value null": _set_cell("board", 0, 2, None),
    "board value float": _set_cell("board", 0, 2, 4.0),
    "board changes a given": _set_cell("board", 0, 0, 1),
    "board clears a given": _set_cell("board", 0, 0, 0),
    "signed conflicting puzzle": _signed_puzzle(_conflicting_puzzle()),
    "signed two-solution puzzle": _signed_puzzle(_two_solution_puzzle()),
    "signed puzzle with too few clues": _signed_puzzle(_too_few_clues_puzzle()),
}


@pytest.mark.parametrize("path", ["/check", "/hint"])
@pytest.mark.parametrize("case", sorted(TAMPERED_OR_MALFORMED_BODIES))
def test_game_routes_reject_malformed_or_tampered_input(client, path, case):
    body = TAMPERED_OR_MALFORMED_BODIES[case](_game_body())

    response = client.post(path, json=body)

    assert response.status_code == 400
    assert response.is_json
    assert set(response.get_json()) == {"error"}


@pytest.mark.parametrize("path", ["/check", "/hint"])
def test_game_routes_reject_non_json_body(client, path):
    response = client.post(path, data="not json", content_type="text/plain")

    assert response.status_code == 400
    assert set(response.get_json()) == {"error"}


@pytest.mark.parametrize("path", ["/check", "/hint"])
def test_game_routes_reject_oversized_body_as_json(client, path):
    response = client.post(
        path, data="x" * (20 * 1024), content_type="application/json"
    )

    assert response.status_code == 413
    assert set(response.get_json()) == {"error"}


def test_responses_never_include_the_solution(client, monkeypatch):
    _use_deterministic_game(monkeypatch)
    game = client.get("/new").get_json()
    payload = game_token.load_signed_puzzle(game["token"], TEST_SECRET_KEY)

    assert "solution" not in game
    assert set(payload) == {"puzzle", "difficulty"}
    assert payload["puzzle"] != SOLUTION
