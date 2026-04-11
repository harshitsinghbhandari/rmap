2024-05-18 - [Optimize line counting for large files]
Learning: Using `String.prototype.split('\n').length` to count lines in a file is highly inefficient as it allocates an array of strings in memory just to discard it.
Action: Use `String.prototype.indexOf('\n')` in a loop instead, drastically reducing memory usage and time, particularly for large text files processed during the harvesting phase.
2026-04-10 - Incremental Test Coverage
Learning: The codebase relies on `c8` and native `node:test` for running tests and tracking coverage. Generating dynamic Markdown files from Bash requires care so literal variables like `$` aren't evaluated too early (or too late) if not escaped. Also, mocking external modules may be tricky if using simple node tools; it's easier to assert functionality on standalone business logic or explicitly pass mock objects.
Action: Next time, carefully double check the backlog generation script output to ensure variables are resolved correctly before committing.
