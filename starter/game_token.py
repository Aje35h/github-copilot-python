"""Signed tokens that authenticate an issued puzzle without storing game state.

Tokens are signed, not encrypted: anyone can read the payload, so it holds
only the puzzle and difficulty and never the solution.
"""
from __future__ import annotations

from typing import Any

from itsdangerous import BadData, URLSafeSerializer

TOKEN_SALT = "sudoku-puzzle-token"


def _serializer(secret_key: str) -> URLSafeSerializer:
    if not secret_key:
        raise ValueError("A secret key is required to sign game tokens.")
    return URLSafeSerializer(secret_key, salt=TOKEN_SALT)


def sign_puzzle(puzzle: list[list[int]], difficulty: str, secret_key: str) -> str:
    """Return a token that authenticates ``puzzle`` and ``difficulty``."""
    return _serializer(secret_key).dumps(
        {"puzzle": puzzle, "difficulty": difficulty}
    )


def load_signed_puzzle(token: Any, secret_key: str) -> dict[str, Any]:
    """Verify ``token`` and return its ``{"puzzle", "difficulty"}`` payload.

    Raises ``ValueError`` if the token is missing, forged, signed with another
    key, or does not contain the expected fields.
    """
    if not isinstance(token, str) or not token:
        raise ValueError("token must be a non-empty string.")
    try:
        payload = _serializer(secret_key).loads(token)
    except BadData:
        raise ValueError("token is invalid.") from None
    if (
        not isinstance(payload, dict)
        or set(payload) != {"puzzle", "difficulty"}
        or not isinstance(payload["difficulty"], str)
    ):
        raise ValueError("token is invalid.")
    return payload
