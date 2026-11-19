# Flask Sudoku Game

A modernized Sudoku game built with Python, Flask, HTML, CSS, and JavaScript.

## Setup

Create and activate a virtual environment, then install the dependencies:

```powershell
py -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
```

## Running the app

```powershell
$env:SUDOKU_SECRET_KEY = 'replace-with-a-long-random-value'
python app.py
```

Open http://127.0.0.1:5000/ in a browser.

`SUDOKU_SECRET_KEY` signs the puzzle token that the browser sends back with
every Check and Hint request. If it is not set, a random key is generated
each time the server starts, so games started before a restart can no longer
be checked; start a new game instead. Never commit a real key.

## How the game works

- The server keeps no game state. `GET /new?difficulty=easy|medium|hard`
  returns the puzzle, the difficulty, and a signed token, but never the
  solution. Medium (32 clues) is the default; Easy has 40 and Hard has 28.
- `POST /check` and `POST /hint` receive `{puzzle, board, token}`. The server
  verifies the token, the board shape and values, that no prefilled value was
  changed, and that the puzzle has exactly one solution, then solves it.
- Check returns only the filled-in incorrect cells and a `complete` flag.
  Hint returns one `{row, col, value}`; the page fills and locks that cell.
- Invalid or tampered requests return HTTP 400 JSON; Hint returns 409 when no
  empty cell remains.

## Running the tests

Python tests (pytest):

```powershell
python -m pytest -q
```

JavaScript helper tests (Node.js 18 or newer, no npm packages needed):

```powershell
node --test tests\js\sudoku_rules.test.js
```

## Manual browser checks

DOM interaction is not covered by automated tests yet. After changing the
frontend, check that:

1. Easy, Medium, and Hard each start a puzzle with 41, 49, and 53 empty cells.
2. Prefilled cells are bold, can be focused with Tab, and cannot be edited.
3. Typing a letter is rejected with a status message.
4. Typing a duplicate in a row, column, or box marks both cells with stripes
   and announces the conflict; a non-conflicting wrong value is not revealed.
5. Check marks only wrong values you entered and reports how many cells are
   still empty.
6. Hint fills one empty cell, underlines it, and locks it.
7. Filling the board correctly shows the completion message.
8. A screen reader announces status messages and each cell's row, column, and
   state.
