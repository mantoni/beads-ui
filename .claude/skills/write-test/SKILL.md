---
name: write-test
description:
  Rules for writing and placing tests in this project. Use when creating or
  updating unit or integration tests for the server, client, view, or protocol
  layers.
---

## Test Locations

Tests are colocated with source files, not in a separate top-level test
directory.

| Where to put it              | Pattern                                |
| ---------------------------- | -------------------------------------- |
| Next to the module under test | `<module>.test.js`                     |
| Unit-only variant             | `<module>.unit.test.js`                |
| Integration/e2e variant       | `<module>.integration.test.js`         |

`test/setup-vitest.js` is global setup — do not add test files there.

## Default Placement

- Pure logic (selectors, data transforms, utilities, protocol parsing):
  colocated `.test.js` with the source file
- Code that exercises the full request/response cycle or WebSocket message
  exchange: `.integration.test.js` (e.g. `server/cli/commands.integration.test.js`)
- If a change crosses both boundaries, add a small unit test first, then the
  narrowest integration test that proves the wiring

## Rules

- Use `vitest` (`describe`, `it`/`test`, `expect`).
- Import from `vitest`, not from `jest`.
- Name files `<module>.test.js` (or `.unit.test.js` / `.integration.test.js`).
- Name tests `<behavior> <expected outcome>` in plain English.
- Keep one test focused on one behavior. Avoid broad scenario piles.
- Server integration tests may use `supertest` or direct module imports — check
  existing examples before choosing.
- Keep secrets, tokens, and credentials out of test code.
- For non-trivial refactors, follow the `refactor-code` skill and add the
  protecting test before changing production code.
- If the code under discussion does not exist yet, describe the protecting test
  that should be added when implementation lands — do not fabricate tests.

## Running Tests

```sh
npm test                          # full Vitest suite
npm test -- app/views/list        # narrowed to a file pattern
npm test -- --reporter=verbose    # more detailed output
```

## Review Checklist

- The test is colocated with the source it exercises
- The name describes behavior, not implementation
- The assertion checks the contract that matters
- Setup is minimal and local to the test unless a shared fixture is clearly
  warranted
- Integration coverage is added when protocol messages, subscription state
  transitions, or server wiring changed
