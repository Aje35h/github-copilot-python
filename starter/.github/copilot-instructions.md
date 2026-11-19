# GitHub Copilot Instructions: Flask Sudoku

## Project Overview

This project modernizes a legacy Sudoku game built with Python, Flask,
HTML, CSS, and JavaScript.

The completed application must provide:

- Easy, Medium, and Hard difficulty levels
- Sudoku puzzles with exactly one unique solution
- Locked prefilled cells
- Immediate visual feedback for invalid moves
- A Check button that highlights incorrect entries
- A Hint button that fills and locks one correct empty cell
- A completion message for correctly solved puzzles
- A game timer
- A persistent Top 10 scoreboard using browser local storage
- Player name, completion time, difficulty, and hints used in scores
- A light and dark mode toggle
- Responsive desktop and mobile layouts
- Alternating colors for the nine 3x3 Sudoku regions

## Development Workflow

- Preserve existing behavior unless a requirement explicitly changes it.
- Establish baseline tests before refactoring application code.
- Make small, reviewable changes.
- Run the complete test suite after every feature or refactor.
- Do not modify unrelated files.
- Explain significant architectural changes before implementing them.
- Never assume generated Sudoku puzzles have unique solutions.
- Verify uniqueness using a solver that counts solutions up to a limit of two.
- Do not accept a puzzle unless its solution count is exactly one.

## Python Standards

- Use modern, readable Python.
- Follow PEP 8 naming and formatting conventions.
- Add type hints to new or modified Python functions.
- Use descriptive names instead of abbreviations.
- Keep Flask routes thin.
- Place reusable Sudoku generation, solving, and validation logic outside routes.
- Prefer small functions with one clear responsibility.
- Add docstrings to public functions and classes.
- Handle invalid input consistently.
- Avoid broad exceptions such as `except Exception` unless re-raised or logged.
- Avoid mutable default arguments.
- Do not use global mutable game state.

## Flask Standards

- Return appropriate HTTP status codes for invalid requests.
- Validate all request data on the server.
- Return JSON responses with consistent field names.
- Keep game logic independent from Flask where practical.
- Do not expose internal exceptions or stack traces to users.

## JavaScript Standards

- Use modern JavaScript with `const` and `let`; do not use `var`.
- Use small, named functions with clear responsibilities.
- Keep DOM selection, game state, persistence, and rendering logically separated.
- Validate values before sending them to the server.
- Avoid inline JavaScript in HTML.
- Store the Top 10 scoreboard and theme preference in localStorage.
- Treat localStorage data as untrusted and validate it before use.
- Keep only the ten fastest valid scores.
- Sort scores by completion time in ascending order.
- Stop the timer when a puzzle is completed.
- Do not allow locked or prefilled cells to be edited.

## HTML and Accessibility

- Use semantic HTML elements.
- Associate labels with form controls.
- Ensure controls are keyboard accessible.
- Provide visible focus indicators.
- Use ARIA live regions for validation and completion messages.
- Do not communicate errors using color alone.
- Add accessible names to icon-only controls.
- Aim for WCAG 2.1 AA color contrast.

## CSS Standards

- Use CSS custom properties for colors, spacing, and theme values.
- Support light and dark modes across the complete interface.
- Use responsive sizing rather than fixed desktop-only dimensions.
- Prevent layout shifts when cells change state.
- Make all nine 3x3 regions visually distinguishable with alternating colors.
- Keep borders, values, feedback states, and controls readable in both themes.
- Avoid unnecessary duplication.

## Testing Standards

- Use pytest for Python tests.
- Add regression tests before changing existing behavior.
- Test Flask routes with Flask's test client.
- Test Sudoku logic independently from Flask.
- Make tests deterministic where random puzzle generation is involved.
- Test valid input, invalid input, and edge cases.
- Verify that generated puzzles have exactly one solution.
- Run all tests after every meaningful change.
- Keep the test command documented in README.md.

## Copilot Response Standards

- Inspect relevant files before suggesting changes.
- Do not invent functions, routes, selectors, or files that do not exist.
- State assumptions clearly.
- Explain unfamiliar libraries or patterns.
- Prefer focused edits over rewriting the whole project.
- Show which files will change before making a multi-file modification.
- Do not claim tests pass unless the tests were actually executed.
- Flag suggestions that could weaken correctness, accessibility, or security.
- Prioritize clarity and maintainability in suggested code changes.
- Avoid introducing unnecessary complexity or over-engineering solutions.
- Suggest solutions that align with existing project conventions and patterns.