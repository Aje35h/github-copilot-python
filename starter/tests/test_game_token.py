import pytest
from itsdangerous import URLSafeSerializer

import game_token


SECRET_KEY = "token-test-key"
PUZZLE = [[0] * 9 for _ in range(9)]
PUZZLE[0][0] = 5


def test_signed_puzzle_round_trips_without_solution():
    token = game_token.sign_puzzle(PUZZLE, "hard", SECRET_KEY)

    assert game_token.load_signed_puzzle(token, SECRET_KEY) == {
        "puzzle": PUZZLE,
        "difficulty": "hard",
    }


@pytest.mark.parametrize(
    "token",
    [
        None,
        "",
        123,
        "not-a-token",
        game_token.sign_puzzle(PUZZLE, "easy", SECRET_KEY) + "x",
        game_token.sign_puzzle(PUZZLE, "easy", "another-key"),
        URLSafeSerializer(SECRET_KEY, salt="other-purpose").dumps(
            {"puzzle": PUZZLE, "difficulty": "easy"}
        ),
        URLSafeSerializer(SECRET_KEY, salt=game_token.TOKEN_SALT).dumps(
            {"puzzle": PUZZLE}
        ),
        URLSafeSerializer(SECRET_KEY, salt=game_token.TOKEN_SALT).dumps(
            {"puzzle": PUZZLE, "difficulty": "easy", "solution": PUZZLE}
        ),
        URLSafeSerializer(SECRET_KEY, salt=game_token.TOKEN_SALT).dumps([PUZZLE]),
    ],
)
def test_load_signed_puzzle_rejects_invalid_tokens(token):
    with pytest.raises(ValueError, match="token"):
        game_token.load_signed_puzzle(token, SECRET_KEY)


def test_signing_requires_a_secret_key():
    with pytest.raises(ValueError, match="secret key"):
        game_token.sign_puzzle(PUZZLE, "easy", "")
