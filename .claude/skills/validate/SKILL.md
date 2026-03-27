---
name: validate
description:
  Select and run the right verification steps based on what changed. Use after
  making code, docs, config, or skill changes to confirm the result is coherent.
---

Inspect what changed first, then run the smallest meaningful verification and
broaden only when the change surface requires it.

## Decision Table

| What changed                                      | Commands to run                                                        |
| ------------------------------------------------- | ---------------------------------------------------------------------- |
| Single test file only                             | `npm test -- <file>` (narrowest target)                                |
| Logic in `app/` or `server/` only                | Narrowest matching test file, then `npm test` if shared behavior       |
| Server/client protocol or WebSocket schema        | `npm test` (full suite — protocol changes ripple across both sides)    |
| Types in `types/`                                 | `npm run tsc`                                                          |
| `.claude/**` or `ORCHESTRATION.md` only           | No app test run; verify referenced paths, commands, and conventions    |
| Docs only (`docs/**`, `AGENTS.md`, `CHANGES.md`)  | Review for accuracy and path/command consistency                       |
| Mixed code + tests                                | Protecting test first, then narrowest `npm test` target, then full suite if shared behavior changed |

## Common Commands

```sh
npm test                  # full Vitest suite
npm test -- app/views/    # narrowed to a directory
npm run tsc               # TypeScript type check
npm run lint              # ESLint
npm run prettier:write    # format
```

## Rules

- Run the smallest protecting test first whenever behavior is changing.
- Prefer targeted test invocations over full-suite runs unless the change is
  broad.
- If server/client protocol, WebSocket message schema, or view state shape
  changed, run the full suite — these changes ripple across boundaries.
- For `.claude/**` and `ORCHESTRATION.md` changes, verify that referenced paths,
  commands, and role boundaries exist in the repo before calling the work
  complete.
- If the target code does not exist yet and the change is documentation or
  orchestration only, do not invent runtime validation; state that the
  verification was a consistency review.
- If full validation cannot run, say exactly what was skipped and why.
