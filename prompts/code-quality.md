# Code Quality & Efficiency Review

Analyze the PR diff for these categories:

## Logic & Correctness
- Null/undefined dereference, off-by-one errors, missing return statements
- Incorrect boolean logic, wrong comparison operators
- Unhandled edge cases in changed code

## Code Smells
- Duplicate code that should be extracted
- Methods that are too long or do too many things
- Deep nesting (3+ levels) that hurts readability
- Misleading variable/function names

## Error Handling
- Swallowed exceptions (empty catch blocks)
- Missing error propagation
- Generic catch-all that hides specific errors

## Efficiency
- Unnecessary object creation in loops
- N+1 query patterns
- Redundant computations that could be cached
- Inefficient data structure choices

## Reuse
- Existing utility functions not used (reinventing)
- Copy-pasted blocks that should be shared

Focus ONLY on changed lines. Be concise. Write like a human reviewer.
