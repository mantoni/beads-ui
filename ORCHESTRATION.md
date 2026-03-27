# Orchestration Policy

> Main agent only. Subagents (`architect`, `engineer`, `code-reviewer`, `writer`) follow their own definitions in `.claude/agents/`.

## Default: Work In The Current Thread

Spawning an agent has overhead. Unless delegation clearly improves the result, work inline.

Never spawn an agent for:
- A single file or very small related change
- Docs, comments, naming, or formatting only
- A narrow, low-risk bug fix
- Repo inspection, explanation, or answers that are faster inline

## When Delegation Pays Off

Consider delegation only when the task is non-trivial under `AGENTS.md` and at least one is true:

- Scope, affected files, or migration risk should be mapped before edits
- The implementation spans multiple coherent phases
- A read-only review of the real diff would materially reduce risk
- Material doc updates are needed alongside code or workflow changes

## Preferred Roles

| Role | When to use |
|---|---|
| `architect` | Non-trivial tasks needing a concrete plan, affected-file analysis, risk mapping, or validation strategy before edits |
| `engineer` | Code changes in `app/`, `tests/`, `alembic/`, config, or tightly coupled workflow files such as `.env.example` |
| `code-reviewer` | Read-only review after non-trivial implementation using the actual changed-file list and diff |
| `writer` | Material updates to `docs/`, `CONTRIBUTING.md`, `AGENTS.md`, or other user-facing workflow docs |

## Workflow For Non-Trivial Tasks

1. Classify the task using `AGENTS.md` Trivial vs Non-Trivial.
2. Trivial: work directly in the current thread. Stop here.
3. Non-trivial: run `architect` first unless the task is already fully specified and planning adds no value.
4. Run `engineer` to implement. Engineer owns the smallest meaningful validation for each phase.
5. Before `code-reviewer`, collect the actual changed-file list and diff from the current worktree. Pass that material to the reviewer; use any plan only as supporting context.
6. Run `code-reviewer` after implementation.
7. If `code-reviewer` finds CRITICAL, HIGH, or MEDIUM issues, send the findings and any `docs/reviews/...` report path back to `engineer`, then rerun `code-reviewer`.
8. Hard limit: 3 engineer/reviewer rounds. After that, stop looping and report unresolved findings.
9. Run `writer` only when docs need material updates.

## Constraints

- Do not spawn agents to bypass repo rules, matched skills, validation steps, or approval requirements.
- Subagents follow the same `AGENTS.md` rules and matched local skills as the main agent.
- When handing off, name the relevant skills explicitly if they matter to the task.
- Keep write ownership clear. Do not have two agents edit the same file in parallel.
