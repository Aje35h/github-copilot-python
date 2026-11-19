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

## Timer, player name, and Top 10 scoreboard

These features run only in the browser; the server is unchanged.

- The timer starts after a valid new puzzle loads, resets for each new game,
  and stops when the puzzle is solved. Time is ranked in whole seconds and
  shown as MM:SS (minutes keep counting past 60).
- The hints counter goes up only after a successful hint response.
- After a puzzle is solved, every cell becomes read-only and Check and Hint
  only report that the puzzle is already solved. Each game is recorded at
  most once.
- Games of 86,400 seconds (24 hours) or longer are not recorded.

### Browser storage

| Key | Value |
|---|---|
| `sudoku.playerName.v1` | The trimmed player name as plain text (1–30 characters, no control characters). Removed when the field is cleared. `Anonymous` is used for an empty name but never stored here. |
| `sudoku.scoreboard.v1` | `{"version":1,"scores":[...]}` with at most 10 scores |
| `sudoku.theme.v1` | `light` or `dark` |

Each score has exactly these fields: `name`, `seconds` (0–86,399), `difficulty`
(`easy`, `medium`, or `hard`), `hintsUsed` (0–81), and `completedAt` (epoch
milliseconds). The puzzle, board, solution, and signed token are never stored.

Scores are sorted by `seconds`, then fewer `hintsUsed`, then earlier
`completedAt`, then `name` by character code, so the order is the same in every
browser. Only the 10 fastest are kept.

Stored data is treated as untrusted. Values that are missing, over 8,192
characters, not JSON, or a different version are ignored. Invalid entries are
dropped, valid ones are rebuilt from the allowed fields only, and names are
displayed as text, never as HTML. Loading never rewrites storage; the next
recorded score replaces bad data.

### Several tabs

When the browser supports the Web Locks API, a score is recorded inside a lock
named `sudoku.scoreboard.v1`, which re-reads, inserts, and saves in one step.
Without Web Locks, the score is recorded without the lock: if two tabs finish
at the same moment, one of the two scores can be lost. Other open tabs update
their table when the scoreboard changes.

Scores live in the player's own browser and can be edited with developer
tools; they are not tamper-proof.

## Light and dark mode

The "Dark mode" button switches the whole page between light and dark themes;
its `aria-pressed` state shows whether dark mode is on. The choice is saved
under `sudoku.theme.v1`. Only the exact values `light` and `dark` are accepted;
any other stored value is ignored and the page uses light mode. The small
`static/theme_boot.js` script runs in `<head>` and applies the saved theme
before the page is drawn, so a dark page does not flash light on refresh.

All colours are CSS custom properties defined once per theme in
`static/styles.css`.

### 3x3 region colours

The nine 3x3 regions alternate between two background colours in a
checkerboard (A B A / B A B / A B A). Every cell starts with region colour A;
CSS `nth-child` selectors on the row and cell switch the top-middle,
middle-left, middle-right, and bottom-middle regions to colour B. Prefilled
cells add a light tint over the region colour, so the pattern stays visible.
The thick borders between regions are unchanged.

Conflicts use diagonal stripes and incorrect entries use an inset frame, both
with error-coloured text, so neither state relies on colour alone.

## Running the tests

Python tests (pytest):

```powershell
python -m pytest -q
```

JavaScript helper tests (Node.js 18 or newer, no npm packages needed):

```powershell
node --test tests\js\sudoku_rules.test.js tests\js\game_timer.test.js tests\js\player_name.test.js tests\js\scoreboard.test.js tests\js\theme.test.js
```

Node 22 does not accept the `tests\js\` folder here, so list each file.
`npm test` runs the same command.

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
9. The timer starts at 00:00 when a puzzle loads, counts up, resets on New
   Game, and stops when the puzzle is solved.
10. Hints used goes up only after a successful hint and resets on New Game.
11. After solving, every cell is read-only; clicking Check again shows
    "already solved" and adds no second score.
12. The completion message gives the time, hints, and Top 10 rank.
13. The player name and the Top 10 survive a page refresh and a browser
    restart; clearing the name records the next score as Anonymous.
14. Corrupt `sudoku.scoreboard.v1` data in developer tools shows an empty
    table without errors.
15. Two tabs that each finish a game both appear in the Top 10, and each
    tab's table updates when the other records a score.
16. At 320 px wide, the scoreboard can be scrolled sideways, including with
    the keyboard after focusing it.
17. The Dark mode button switches the whole page, including the board,
    controls, messages, and scoreboard, and its pressed state is announced.
18. The chosen theme survives a refresh without a light flash; setting
    `sudoku.theme.v1` to any other value shows light mode.
19. The nine 3x3 regions alternate colours in both themes, including under
    prefilled cells, and the thick region borders remain.
20. Prefilled, hinted, editable, conflicting, and incorrect cells can be told
    apart in both themes.
21. At 320 px and at desktop width the whole board is visible and the page
    does not scroll sideways.
22. Keyboard focus is clearly visible in both themes, and cell states or
    messages do not move the board.
