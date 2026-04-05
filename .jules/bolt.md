2024-05-18 - [Optimize line counting for large files]
Learning: Using `String.prototype.split('\n').length` to count lines in a file is highly inefficient as it allocates an array of strings in memory just to discard it.
Action: Use `String.prototype.indexOf('\n')` in a loop instead, drastically reducing memory usage and time, particularly for large text files processed during the harvesting phase.
