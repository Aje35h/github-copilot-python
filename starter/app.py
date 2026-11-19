import mimetypes
import os
import secrets

from flask import Flask, render_template, jsonify, request

import game_token
import sudoku_logic

# Windows can map .js to text/plain, which browsers refuse for module scripts.
mimetypes.add_type('text/javascript', '.js')

GAME_FIELDS = ('puzzle', 'board', 'token')

app = Flask(__name__)
# Without SUDOKU_SECRET_KEY, a random per-process key is used: tokens stop
# working after a restart, but no guessable secret is ever shipped.
app.config['SECRET_KEY'] = (
    os.environ.get('SUDOKU_SECRET_KEY') or secrets.token_hex(32)
)
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024


@app.errorhandler(413)
def request_too_large(_error):
    return jsonify({'error': 'Request body is too large.'}), 413


@app.route('/')
def index():
    return render_template('index.html')


@app.route('/new')
def new_game():
    try:
        difficulty, clue_count = sudoku_logic.parse_game_settings(
            request.args.get('difficulty'), request.args.get('clues')
        )
    except ValueError as error:
        return jsonify({'error': str(error)}), 400
    try:
        puzzle, _solution = sudoku_logic.generate_puzzle(clue_count)
    except RuntimeError:
        return jsonify({'error': 'Could not generate a puzzle. Please try again.'}), 500
    token = game_token.sign_puzzle(puzzle, difficulty, app.config['SECRET_KEY'])
    return jsonify({'puzzle': puzzle, 'difficulty': difficulty, 'token': token})


def read_game_request() -> tuple[list[list[int]], list[list[int]]]:
    """Validate a ``{puzzle, board, token}`` body and return ``(board, solution)``.

    Raises ``ValueError`` for a malformed, invalid, or tampered request.
    """
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        raise ValueError('Request body must be a JSON object.')
    missing = [field for field in GAME_FIELDS if field not in data]
    if missing:
        raise ValueError(f"Request is missing: {', '.join(missing)}.")
    payload = game_token.load_signed_puzzle(
        data['token'], app.config['SECRET_KEY']
    )
    puzzle = data['puzzle']
    sudoku_logic.validate_board(puzzle)
    if puzzle != payload['puzzle']:
        raise ValueError('puzzle does not match the game token.')
    board = data['board']
    solution = sudoku_logic.solve_validated_game(puzzle, board)
    return board, solution


@app.route('/check', methods=['POST'])
def check_solution():
    try:
        board, solution = read_game_request()
    except ValueError as error:
        return jsonify({'error': str(error)}), 400
    incorrect = sudoku_logic.find_incorrect_cells(board, solution)
    return jsonify({
        'incorrect': incorrect,
        'complete': sudoku_logic.is_board_complete(board, incorrect),
    })


@app.route('/hint', methods=['POST'])
def hint():
    try:
        board, solution = read_game_request()
    except ValueError as error:
        return jsonify({'error': str(error)}), 400
    found = sudoku_logic.find_hint(board, solution)
    if found is None:
        return jsonify({'error': 'No empty cell is left for a hint.'}), 409
    row, col, value = found
    return jsonify({'row': row, 'col': col, 'value': value})


if __name__ == '__main__':
    app.run(debug=True)