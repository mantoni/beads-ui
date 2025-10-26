# Agents

## Beads (bd) — Work Tracking

Use MCP `beads` (bd) as our dependency‑aware issue tracker. Run
`beads/quickstart` to learn how to use it.

### Issue Types

- `bug` - Something broken that needs fixing
- `feature` - New functionality
- `task` - Work item (tests, docs, refactoring)
- `epic` - Large feature composed of multiple issues
- `chore` - Maintenance work (dependencies, tooling)

### Priorities

- `0` - Critical (security, data loss, broken builds)
- `1` - High (major features, important bugs)
- `2` - Medium (nice-to-have features, minor bugs)
- `3` - Low (polish, optimization)
- `4` - Backlog (future ideas)

### Dependency Types

- `blocks` - Hard dependency (issue X blocks issue Y)
- `related` - Soft relationship (issues are connected)
- `parent-child` - Epic/subtask relationship
- `discovered-from` - Track issues discovered during work

Only `blocks` dependencies affect the ready work queue.

### Structured Fields and Labels

- Use issue `type` and `priority` fields.
- Use issue type "epic" and `parent-child` dependencies.
- Use `related` or `discovered-from` dependencies.
- Area pointers are labels, e.g.: `frontend`, `backend`

### Agent Workflow

If no issue is specified, run `bd ready` and claim an unblocked issue.

1. Open issue with `bd show <id>` and read all linked docs.
2. Assign to `agent`, update status as you work (`in_progress` → `closed`);
   maintain dependencies, and attach notes/links for traceability.
3. Discover new work? Create linked issue with dependency
   `discovered-from:<parent-id>` and reference it in a code comment.
4. Land the change; run tests/lint; update any referenced docs.
5. Close the issue with `bd close <id>`.

Never update `CHANGES.md`.

## Coding Standards

- Use ECMAScript modules.
- Use `PascalCase` for classes and interfaces.
- Use `camelCase` for functions and methods.
- Use `lower_snake_case` for all variables and parameters, unless the value is a
  function where `camelCase` is preferred.
- Use `UPPER_SNAKE_CASE` for constants.
- Use `kebab-case` for file and directory names.
- Use `.js` files for all code with JSDoc type annotations (TypeScript mode).
- Use `.ts` files only for interface definitions.
- Use `@import { X, Y, Z } from './file.js` in a JSDoc block at the top of the
  file for type imports; omit if the symbol is already defined in code.
- Add JSDoc to all functions and methods and declare all parameter types with
  `@param`; If the return type is non-trival, add `@returns`, otherwise omit.
- If a local valiable's type may change, or the initializer is `[]` or `{}` with
  not yet known content, add a `@type` JSDoc annotation.
- Use blocks for all control flow statements, even single-line bodies.
- Rely on type information to reduce `?.`, `??`, `??=`, `||`, `||=` usage.

## Unit Testing Standards

- Write short, focused test-case functions asserting one behavior each.
- Do not use "should" in test names; use verbs like "returns", "throws",
  "emits", or "calls"
- Structure: setup → execution → assertion (separate with blank lines).
- Never change implementation code to make tests pass.

## Pre‑Handoff Validation

- Run type checks: `npm run typecheck`
- Run tests: `npm test`
- Run eslint: `npm run lint`
- Run prettier: `npm run format`
